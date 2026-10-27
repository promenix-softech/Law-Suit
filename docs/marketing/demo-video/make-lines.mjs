// script.json → tts line list for one language.  node make-lines.mjs <en|mr> > lines.<lang>.json
import { readFileSync } from "node:fs";

const lang = process.argv[2];
const script = JSON.parse(readFileSync(new URL("./script.json", import.meta.url), "utf8"));
const lines = script.scenes.map((s) => ({
  id: `${lang}-${s.id}`,
  lang: lang === "mr" ? "mr-IN" : "en-IN",
  speaker: script.voices[lang],
  text: s[lang],
  pace: 0.95,
}));
process.stdout.write(JSON.stringify(lines, null, 2));
