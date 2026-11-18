/**
 * Boos Kadazan friends server (Cloudflare Worker + D1).
 *
 * Each learner who joins gets a short friend code and a long secret. The code is
 * shared freely: anyone who has it can read that learner's display name and
 * progress. Only the device holding the secret can change or delete the entry.
 *
 *   POST   /api/learners                 {name}            -> {code, secret, name}
 *   GET    /api/learners?codes=A,B,C                       -> {learners: [...]}
 *   PUT    /api/learners/:code  (Bearer secret) {progress} -> {learner}
 *   DELETE /api/learners/:code  (Bearer secret)            -> {ok: true}
 *   GET    /api/health                                     -> {ok: true}
 */

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0, 1, I or O
const CODE_RE = /^[2-9A-HJ-NP-Z]{6}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NAME_RE = /^[\p{L}\p{M}\p{N} .'\-_]{1,24}$/u;
const MAX_BATCH = 50;
const MAX_BODY = 4096;
const MAX_NEW_PER_DAY = 20;
const MAX_NUMBER = 10_000_000;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env.ALLOWED_ORIGINS || '');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    let res;
    try {
      res = await route(request, env);
    } catch (err) {
      console.error(err && err.stack ? err.stack : String(err));
      res = json({ error: 'server_error' }, 500);
    }
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  },
};

function corsHeaders(origin, allowedList) {
  const allowed = allowedList.split(',').map((s) => s.trim()).filter(Boolean);
  const h = { Vary: 'Origin' };
  if (origin && (allowed.includes('*') || allowed.includes(origin))) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const m = request.method;

  if (path === '/api/health' && m === 'GET') return json({ ok: true });
  if (path === '/api/learners' && m === 'POST') return createLearner(request, env);
  if (path === '/api/learners' && m === 'GET') return getLearners(url, env);

  const one = path.match(/^\/api\/learners\/([^/]+)$/);
  if (one) {
    const code = normCode(decodeURIComponent(one[1]));
    if (!code) return json({ error: 'bad_code' }, 400);
    if (m === 'PUT') return updateLearner(request, env, code);
    if (m === 'DELETE') return deleteLearner(request, env, code);
  }
  return json({ error: 'not_found' }, 404);
}

/* ---------- handlers ---------- */

async function createLearner(request, env) {
  const body = await readJson(request);
  if (!body) return json({ error: 'bad_body' }, 400);
  const name = cleanName(body.name);
  if (!name) return json({ error: 'bad_name' }, 400);

  // Limit new codes per network per day.
  const day = new Date().toISOString().slice(0, 10);
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const ipHash = await sha256(ip + '|' + day);
  const row = await env.DB.prepare('SELECT n FROM create_log WHERE ip_hash = ? AND day = ?').bind(ipHash, day).first();
  if (row && row.n >= MAX_NEW_PER_DAY) return json({ error: 'too_many' }, 429);

  const secret = randomToken(32);
  const secretHash = await sha256(secret);
  const now = Date.now();
  let code = null;
  for (let i = 0; i < 6 && !code; i++) {
    const candidate = randomCode();
    const res = await env.DB.prepare(
      'INSERT OR IGNORE INTO learners (code, name, secret_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(candidate, name, secretHash, now, now).run();
    if (res.meta && res.meta.changes === 1) code = candidate;
  }
  if (!code) return json({ error: 'server_busy' }, 503);

  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO create_log (ip_hash, day, n) VALUES (?, ?, 1) ON CONFLICT(ip_hash, day) DO UPDATE SET n = n + 1'
    ).bind(ipHash, day),
    env.DB.prepare('DELETE FROM create_log WHERE day < ?').bind(day),
  ]);
  return json({ code, secret, name }, 201);
}

async function getLearners(url, env) {
  const raw = (url.searchParams.get('codes') || '').split(',');
  const codes = [...new Set(raw.map(normCode).filter(Boolean))].slice(0, MAX_BATCH);
  if (!codes.length) return json({ learners: [] });
  const marks = codes.map(() => '?').join(',');
  const { results } = await env.DB.prepare(
    `SELECT code, name, xp, streak, streak_last, lessons, week_key, week_xp, updated_at FROM learners WHERE code IN (${marks})`
  ).bind(...codes).all();
  return json({ learners: results.map(publicLearner) }, 200, { 'Cache-Control': 'no-store' });
}

async function updateLearner(request, env, code) {
  const owner = await authorise(request, env, code);
  if (owner.res) return owner.res;
  const body = await readJson(request);
  if (!body) return json({ error: 'bad_body' }, 400);

  const fields = {
    xp: cleanInt(body.xp),
    streak: cleanInt(body.streak),
    streak_last: cleanDate(body.streakLast),
    lessons: cleanInt(body.lessons),
    week_key: cleanDate(body.weekKey),
    week_xp: cleanInt(body.weekXp),
  };
  if (Object.values(fields).some((v) => v === undefined)) return json({ error: 'bad_progress' }, 400);
  let name = owner.row.name;
  if (body.name !== undefined) {
    name = cleanName(body.name);
    if (!name) return json({ error: 'bad_name' }, 400);
  }
  const now = Date.now();
  await env.DB.prepare(
    `UPDATE learners SET name = ?, xp = ?, streak = ?, streak_last = ?, lessons = ?, week_key = ?, week_xp = ?, updated_at = ?
     WHERE code = ?`
  ).bind(name, fields.xp, fields.streak, fields.streak_last, fields.lessons, fields.week_key, fields.week_xp, now, code).run();
  return json({ learner: publicLearner({ code, name, ...fields, updated_at: now }) });
}

async function deleteLearner(request, env, code) {
  const owner = await authorise(request, env, code);
  if (owner.res) return owner.res;
  await env.DB.prepare('DELETE FROM learners WHERE code = ?').bind(code).run();
  return json({ ok: true });
}

/* ---------- helpers ---------- */

async function authorise(request, env, code) {
  const auth = request.headers.get('Authorization') || '';
  const secret = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!secret || secret.length > 200) return { res: json({ error: 'unauthorised' }, 401) };
  const row = await env.DB.prepare('SELECT name, secret_hash FROM learners WHERE code = ?').bind(code).first();
  if (!row) return { res: json({ error: 'not_found' }, 404) };
  const given = await sha256(secret);
  if (!timingSafeEqual(given, row.secret_hash)) return { res: json({ error: 'unauthorised' }, 401) };
  return { row };
}

function publicLearner(r) {
  return {
    code: r.code,
    name: r.name,
    xp: r.xp || 0,
    streak: r.streak || 0,
    streakLast: r.streak_last || null,
    lessons: r.lessons || 0,
    weekKey: r.week_key || null,
    weekXp: r.week_xp || 0,
    updatedAt: r.updated_at || 0,
  };
}

async function readJson(request) {
  const text = await request.text();
  if (!text || text.length > MAX_BODY) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

function cleanName(v) {
  if (typeof v !== 'string') return null;
  const s = v.normalize('NFC').replace(/\s+/g, ' ').trim();
  return NAME_RE.test(s) ? s : null;
}
function normCode(v) {
  const s = String(v || '').toUpperCase().replace(/[\s-]/g, '');
  return CODE_RE.test(s) ? s : null;
}
function cleanInt(v) {
  return Number.isInteger(v) && v >= 0 && v <= MAX_NUMBER ? v : undefined;
}
function cleanDate(v) {
  if (v === null || v === undefined || v === '') return null;
  return typeof v === 'string' && DATE_RE.test(v) ? v : undefined;
}

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}
function randomToken(n) {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
}
