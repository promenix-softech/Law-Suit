# Civil Suits — product demo film (EN / MR)

Animated product film with English and Marathi narration, rendered from HTML. Every case
detail on screen is invented demo data (M/s Demo Agro Traders, Union Bank of India demo branch,
Nashik); nothing comes from a real file. Benefit figures are the estimates in `docs/plan.md`
§E6 and are shown with an "estimate" footnote.

| File | What |
|---|---|
| `script.json` | Scenes with English and Marathi narration, minimum length, Sarvam voices |
| `film.html` | The film: scenes, on-screen text (EN/MR), deterministic `renderFrame(t)` |
| `tts.mjs` | Narration via Sarvam `bulbul:v3`, spoken sentence by sentence (long texts get cut off), with cue timings for captions |
| `make-lines.mjs` | `script.json` → TTS line list for one language |
| `render.mjs` | Renders 1920×1080 @ 30 fps with Playwright, builds the narration + ambient bed and muxes the MP4 |

## Make the videos

```bash
cd docs/marketing/demo-video
npm init -y && npm install @fontsource/inter @fontsource/noto-sans-devanagari
mkdir -p fonts && cp node_modules/@fontsource/inter/files/inter-latin-{400,500,600,700,800}-normal.woff2 \
  node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-{400,500,600,700,800}-normal.woff2 fonts/
node make-lines.mjs en > lines.en.json && node make-lines.mjs mr > lines.mr.json
node tts.mjs lines.en.json vo && node tts.mjs lines.mr.json vo     # needs api.sarvam.ai (key via SARVAM_API_KEY or proxy)
node render.mjs en --stills 5,30,60     # preview frames in out/
node render.mjs en && node render.mjs mr  # out/civil-suits-demo-{en,mr}.mp4
```

Needs ffmpeg and Playwright Chromium. Generated audio, fonts and videos stay out of git.

## Editing
- Narration: edit `script.json`, delete `vo/<lang>-<scene>.*`, rerun `tts.mjs`. In Marathi write
  abbreviations without dots (एआय, ओसीआर) — a dot ends a sentence for the speech engine.
- Scene length follows the narration (`lead + voice + 1.3 s`, at least `min`).
- On-screen text: `TXT.en` / `TXT.mr` in `film.html`. Keep content above y≈900 px so captions never cover it.
- Contact details for the end card are not set yet — add the website / phone in the `s11-outro` scene.
