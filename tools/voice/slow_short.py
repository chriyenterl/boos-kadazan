# Re-voice the words that came out too quick (under 0.3 s of voiced sound) at a slower rate.
import json, os, re, subprocess, sys, wave
import numpy as np, torch
from transformers import VitsModel, VitsTokenizer, set_seed
base, out_dir = sys.argv[1], sys.argv[2]
manifest = json.load(open(os.path.join(out_dir, 'manifest.json'), encoding='utf-8'))
model = VitsModel.from_pretrained(os.path.join(base, 'model'), use_safetensors=True).eval()
tok = VitsTokenizer.from_pretrained(os.path.join(base, 'model'))
rate = model.config.sampling_rate
def voiced(x):
    f = int(rate * 0.02); n = len(x) // f
    return sum(np.sqrt(np.mean(x[i*f:(i+1)*f] ** 2)) > 0.05 for i in range(n)) * 0.02
def model_text(k):
    return re.sub(r"[^a-z' \-]", '', k.replace('’', "'").replace('v', 'w').replace('z', 'y'))
redone = []
for k, s in manifest.items():
    wpath = os.path.join(base, 'wav', s + '.wav')
    with wave.open(wpath) as w: x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32767
    if voiced(x) >= 0.3: continue
    model.speaking_rate = 0.72
    set_seed(7)
    with torch.no_grad(): wav = model(**tok(model_text(k), return_tensors='pt')).waveform[0].numpy()
    pad = np.zeros(int(rate * 0.08), dtype=np.float32); wav = np.concatenate([pad, wav, pad])
    pcm = (wav / (float(np.max(np.abs(wav))) or 1) * 0.9 * 32767).astype(np.int16)
    with wave.open(wpath, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(pcm.tobytes())
    subprocess.run(['afconvert', '-f', 'mp4f', '-d', 'aac', '-b', '40000', wpath, os.path.join(out_dir, s + '.mp4')], check=True)
    redone.append((k, round(voiced(pcm.astype(np.float32) / 32767), 2)))
print(len(redone), 're-voiced slower:', ', '.join(f'{k} ({v}s)' for k, v in redone))
