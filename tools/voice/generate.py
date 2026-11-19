# Voices every word and phrase of Boos Kadazan with Meta's MMS-TTS Kadazan Dusun model (CC BY-NC 4.0).
import json, os, re, subprocess, sys, wave
import numpy as np, torch
from transformers import VitsModel, VitsTokenizer, set_seed

base, texts_file, out_dir = sys.argv[1], sys.argv[2], sys.argv[3]
texts = json.load(open(texts_file, encoding='utf-8'))
os.makedirs(out_dir, exist_ok=True)
tmp = os.path.join(base, 'wav'); os.makedirs(tmp, exist_ok=True)

def key(t):   # must match audioKey() in the app
    t = t.lower().replace('‘', '’').replace("'", '’').replace('`', '’').replace('ʼ', '’')
    t = re.sub(r'[?!.,…"“”:;]', ' ', t)
    return re.sub(r'\s+', ' ', t).strip()
def slug(k):
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', k.replace('’', ''))).strip('-')
def model_text(t):
    # The model writes Kadazandusun spelling: no v or z, a plain apostrophe for the glottal stop.
    t = key(t).replace('’', "'").replace('v', 'w').replace('z', 'y')
    return re.sub(r"[^a-z' \-]", '', t)

model = VitsModel.from_pretrained(os.path.join(base, 'model'), use_safetensors=True).eval()
tok = VitsTokenizer.from_pretrained(os.path.join(base, 'model'))
model.speaking_rate = 0.92
rate = model.config.sampling_rate
manifest, report, used = {}, [], set()
for t in texts:
    k = key(t)
    if not k or k in manifest: continue
    s = slug(k); n = 2
    while s in used: s = f'{slug(k)}-{n}'; n += 1
    used.add(s)
    set_seed(7)
    with torch.no_grad():
        wav = model(**tok(model_text(t), return_tensors='pt')).waveform[0].numpy()
    pad = np.zeros(int(rate * 0.08), dtype=np.float32)
    wav = np.concatenate([pad, wav, pad])
    peak = float(np.max(np.abs(wav))) or 1.0
    pcm = (wav / peak * 0.9 * 32767).astype(np.int16)
    wpath = os.path.join(tmp, s + '.wav')
    with wave.open(wpath, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(pcm.tobytes())
    mpath = os.path.join(out_dir, s + '.mp4')
    subprocess.run(['afconvert', '-f', 'mp4f', '-d', 'aac', '-b', '40000', wpath, mpath], check=True)
    manifest[k] = s
    report.append((k, model_text(t), round(len(wav) / rate, 2), round(float(np.sqrt(np.mean(wav ** 2))), 3)))
json.dump(manifest, open(os.path.join(out_dir, 'manifest.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0, sort_keys=True)
json.dump(report, open(os.path.join(base, 'report.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print('voiced', len(manifest), 'clips at', rate, 'Hz')
