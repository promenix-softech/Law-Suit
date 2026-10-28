// Text-to-speech through Sarvam (bulbul:v3); the proxy injects the API key.
// Usage: node tts.mjs <lines.json> <outDir>   lines.json = [{ id, lang: "en-IN"|"mr-IN", speaker, text, pace? }]
// Long texts get cut off by the service, so each line is spoken sentence by sentence and joined
// with a short pause. Sentence timings are written to <id>.json for the captions.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , linesPath, outDir] = process.argv;
const lines = JSON.parse(readFileSync(linesPath, "utf8"));
mkdirSync(outDir, { recursive: true });
const GAP = 0.28; // seconds between sentences

/** Sentences, keeping the closing mark; very long ones split again at dashes or colons. */
export function sentences(text) {
  const parts = text.match(/[^.?!।]+[.?!।]+(\s|$)|[^.?!।]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
  return parts.flatMap((s) => (s.length > 180 ? s.split(/(?<=[—:])\s+/).map((x) => x.trim()).filter(Boolean) : [s]));
}

const duration = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim());

function speak(text, l, out) {
  const body = JSON.stringify({ text, target_language_code: l.lang, speaker: l.speaker, model: "bulbul:v3", pace: l.pace ?? 1.0, speech_sample_rate: 24000 });
  const res = execFileSync("curl", ["-sS", "-X", "POST", "https://api.sarvam.ai/text-to-speech", "-H", "Content-Type: application/json", "--data-binary", "@-"], {
    input: body,
    maxBuffer: 64 * 1024 * 1024,
  }).toString();
  const json = JSON.parse(res);
  if (json.audios?.length !== 1) throw new Error(`${out}: ${res.slice(0, 300)}`);
  writeFileSync(out, Buffer.from(json.audios[0], "base64"));
}

for (const l of lines) {
  const out = join(outDir, `${l.id}.wav`);
  if (existsSync(out) && !process.env.FORCE) continue;
  const parts = sentences(l.text);
  const files = [];
  const cues = [];
  let t = 0;
  parts.forEach((s, i) => {
    const f = join(outDir, `${l.id}.s${i}.wav`);
    speak(s, l, f);
    const d = duration(f);
    cues.push({ text: s, start: t, end: t + d });
    t += d + GAP;
    files.push(f);
  });
  // Join with silence between sentences (all clips are 24 kHz mono).
  const inputs = files.flatMap((f) => ["-i", f]);
  const chain = files.map((_, i) => (i < files.length - 1 ? `[${i}:a]apad=pad_dur=${GAP}[a${i}];` : `[${i}:a]anull[a${i}];`)).join("");
  const concat = files.map((_, i) => `[a${i}]`).join("") + `concat=n=${files.length}:v=0:a=1[out]`;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", chain + concat, "-map", "[out]", "-ar", "24000", "-ac", "1", out]);
  writeFileSync(join(outDir, `${l.id}.json`), JSON.stringify({ duration: duration(out), cues }, null, 2));
  console.log("ok", l.id, parts.length, "sentences", duration(out).toFixed(2), "s");
}
