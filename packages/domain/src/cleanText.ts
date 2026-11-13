import { stripInvisible } from "./promptGuard";

// C0 controls except tab / line feed / carriage return, DEL, and the C1 block.
const CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
// Format characters (direction marks, soft hyphen, …) except ZWNJ / ZWJ, which stripInvisible
// keeps only inside Devanagari words.
const FORMAT = /(?![‌‍])\p{Cf}/gu;
// Characters that print as nothing but are not format characters: combining grapheme joiner,
// Hangul fillers, Mongolian vowel separator.
const BLANKS = /[͏ᅟᅠ᠎ㅤﾠ]/g;
const SPACES = /[\t  -   　]/g;

/**
 * Cleans text a person typed or pasted before it is stored and printed in a court paper:
 * Unicode NFC (so the same Marathi word is stored the same way), no control characters, no
 * invisible or direction-changing characters (ZWJ/ZWNJ kept inside Devanagari words), tabs and
 * no-break spaces as plain spaces, runs of spaces collapsed, ends trimmed. Single-line text
 * (names) also turns line breaks into spaces; `multiline` keeps every line (so a "line 7"
 * message still points at the person's line 7), each one tidied.
 *
 * Every step is a linear scan (no backtracking pattern), so long input costs little.
 */
export function cleanText(input: string, opts: { multiline?: boolean } = {}): string {
  let s = input.normalize("NFC").replace(/\r\n?/g, "\n").replace(CONTROLS, "").replace(FORMAT, "").replace(BLANKS, "");
  s = stripInvisible(s).replace(SPACES, " ");
  if (!opts.multiline) return s.replace(/\s+/g, " ").trim();
  const lines = s.split("\n").map((line) => line.replace(/ {2,}/g, " ").trim());
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

/** True when the text has at least one letter (any script): a name cannot be only marks or spaces. */
export const hasLetter = (s: string): boolean => /\p{L}/u.test(s);
