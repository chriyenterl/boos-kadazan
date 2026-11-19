# The built-in voice

Every word and phrase in the course has a short clip in `assets/voice/`, made with Meta's
[MMS-TTS Kadazan Dusun model](https://huggingface.co/facebook/mms-tts-dtp) (licence CC BY-NC 4.0, so the app must stay free and non-commercial).
The model writes Kadazandusun spelling, so `v` is voiced as `w` and `z` as `y`.

To voice new words after editing the course:

1. Make a Python environment with `torch` and `transformers`, and download `config.json`, `vocab.json`,
   `tokenizer_config.json`, `special_tokens_map.json` and `model.safetensors` from the model page into `<base>/model`.
2. List the texts: `osascript -l JavaScript tools/voice/list-texts.js <path to the app's source html> > <base>/texts.json`
3. Voice them: `python generate.py <base> <base>/texts.json assets/voice`, then `python slow_short.py <base> assets/voice`
4. Paste `assets/voice/manifest.json` into `VOICE_FILES` in the page.
