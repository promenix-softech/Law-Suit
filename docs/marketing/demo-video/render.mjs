// Renders the product film for one language, frame by frame, and muxes the narration.
//   node render.mjs <en|mr> [--stills 1,12,40]   (stills: PNG previews at those seconds, no video)
import { spawn, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
const { chromium } = createRequire(process.cwd() + "/")("playwright");

const DIR = dirname(fileURLToPath(import.meta.url));
const lang = process.argv[2];
const stillsArg = process.argv.indexOf("--stills");
const stills = stillsArg > 0 ? process.argv[stillsArg + 1].split(",").map(Number) : null;
const FPS = 30, LEAD = 0.7, TAIL = 1.3;

const script = JSON.parse(readFileSync(join(DIR, "script.json"), "utf8"));
let t = 0;
const scenes = script.scenes.map((s) => {
  const vo = JSON.parse(readFileSync(join(DIR, "vo", `${lang}-${s.id}.json`), "utf8"));
  const lead = s.lead ?? LEAD;
  const dur = Math.max(s.min, lead + vo.duration + TAIL);
  const sc = { id: s.id, start: t, dur, voiceStart: lead, voiceDur: vo.duration, cues: vo.cues, wav: join(DIR, "vo", `${lang}-${s.id}.wav`) };
  t += dur;
  return sc;
});
const total = t;
console.log(lang, "total", total.toFixed(1), "s");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(pathToFileURL(join(DIR, "film.html")).href);
await page.evaluate(() => document.fonts.ready);
await page.evaluate((film) => window.setupFilm(film), { lang, scenes: scenes.map(({ wav, ...s }) => s) });
await page.evaluate(() => document.fonts.ready);

const out = join(DIR, "out");
mkdirSync(out, { recursive: true });

if (stills) {
  for (const s of stills) {
    await page.evaluate((x) => window.renderFrame(x), s);
    await page.screenshot({ path: join(out, `still-${lang}-${String(s).padStart(5, "0")}.png`) });
  }
  await browser.close();
  process.exit(0);
}

// Narration track: each scene's voice placed at its start + lead.
const inputs = scenes.flatMap((s) => ["-i", s.wav]);
const delays = scenes.map((s, i) => `[${i}:a]adelay=${Math.round((s.start + s.voiceStart) * 1000)}:all=1[v${i}]`).join(";");
const mix = scenes.map((_, i) => `[v${i}]`).join("") + `amix=inputs=${scenes.length}:normalize=0,apad=whole_dur=${total.toFixed(2)}[nar]`;
const narr = join(out, `narration-${lang}.wav`);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", `${delays};${mix}`, "-map", "[nar]", "-ar", "48000", "-ac", "2", narr]);

// Soft ambient bed: a slow, low chord, faded in and out, well under the voice.
const bed = join(out, `bed-${lang}.wav`);
const chord = [110, 164.81, 220, 277.18, 329.63].map((f, i) => `${(0.16 / (i + 1)).toFixed(3)}*sin(2*PI*${f}*t)*(0.75+0.25*sin(2*PI*${(0.05 + i * 0.013).toFixed(3)}*t))`).join("+");
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `aevalsrc='${chord}':s=48000:d=${total.toFixed(2)}`,
  "-af", `lowpass=f=900,afade=t=in:d=3,afade=t=out:st=${(total - 4).toFixed(2)}:d=4,volume=0.55`, "-ac", "2", bed]);

const final = join(out, `civil-suits-demo-${lang}.mp4`);
const ff = spawn("ffmpeg", [
  "-y", "-loglevel", "error",
  "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
  "-i", narr, "-i", bed,
  "-filter_complex", "[2:a]volume=0.22[b];[1:a][b]amix=inputs=2:normalize=0,alimiter=limit=0.95[a]",
  "-map", "0:v", "-map", "[a]",
  "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
  "-c:a", "aac", "-b:a", "192k", "-shortest", final,
], { stdio: ["pipe", "inherit", "inherit"] });

const frames = Math.ceil(total * FPS);
for (let f = 0; f < frames; f++) {
  await page.evaluate((x) => window.renderFrame(x), f / FPS);
  const buf = await page.screenshot({ type: "jpeg", quality: 92 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  if (f % 300 === 0) console.log(`${lang} frame ${f}/${frames}`);
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
await browser.close();
writeFileSync(join(out, `timeline-${lang}.json`), JSON.stringify(scenes.map(({ wav, ...s }) => s), null, 2));
console.log("done", final);
