/**
 * Prompt-injection guards (skill: prompt-injection-defense). Pure functions, no I/O.
 * Detection is a tripwire that routes text to a human; containment comes from least
 * privilege, schema-validated output and code-side decisions — never from these alone.
 */

// Zero-width (except ZWJ/ZWNJ inside Indic words, handled below), bidi controls, BOM, tags.
const INVISIBLE = /[​⁠⁡-⁤﻿‪-‮⁦-⁩­]|[\u{E0000}-\u{E007F}]/gu;
const ZW_JOINERS = /[‌‍]/g;
const DEVANAGARI = /[ऀ-ॿ]/;

/** Removes characters people cannot see but models read. Keeps ZWJ/ZWNJ between Devanagari letters. */
export function stripInvisible(text: string): string {
  const out = text.replace(INVISIBLE, "");
  return out.replace(ZW_JOINERS, (m, offset: number, s: string) =>
    DEVANAGARI.test(s[offset - 1] ?? "") && DEVANAGARI.test(s[offset + 1] ?? "") ? m : "",
  );
}

interface Rule {
  id: string;
  weight: number;
  re: RegExp;
}

// Weights: ≥ 3 alone makes a text suspicious; weaker signals need company.
const RULES: Rule[] = [
  { id: "override", weight: 4, re: /\b(ignore|disregard|forget|override|bypass)\b[\s\S]{0,40}\b(previous|prior|above|earlier|all|any|your|the)\b[\s\S]{0,30}\b(instructions?|prompts?|rules?|directions?|guidelines?|messages?|context)\b/i },
  { id: "override", weight: 4, re: /\b(forget|disregard)\b[\s\S]{0,20}\b(everything|all)\b[\s\S]{0,30}\b(told|said|above|before)\b/i },
  { id: "new_instructions", weight: 3, re: /\b(new|updated|real|actual)\s+(instructions?|task|rules)\s*[:-]/i },
  { id: "override_hinglish", weight: 4, re: /\b(pichl[ea]|purane|sab(hi)?|saare)\b[\s\S]{0,30}\b(instructions?|nirdesh)\b[\s\S]{0,20}\b(ignore|bhool|chhod)/i },
  { id: "override_mr_hi", weight: 4, re: /(मागील|पूर्वीच्या|आधीच्या|पिछले|पिछली|पहले के)[\s\S]{0,30}(सूचना|निर्देश|आदेश)[\s\S]{0,40}(दुर्लक्ष|अनदेखा|नजरअंदाज|विसर|भूल)/u },
  { id: "role_markup", weight: 4, re: /<\|im_(start|end)\|>|\[\/?INST\]|<<\/?SYS>>|<\/?(system|assistant)>|^\s*#{2,}\s*(system|instruction)s?\s*:/im },
  { id: "role_markup", weight: 3, re: /^\s*(human|assistant|user)\s*:\s*\S/im },
  { id: "persona", weight: 3, re: /\byou are now\b|\bdeveloper mode\b|\bjailbreak\b|\bDAN\b|\bno (rules|restrictions|limits)\b/i },
  { id: "pretend", weight: 3, re: /\b(pretend|act as|roleplay as)\b[\s\S]{0,40}\b(approver|admin|administrator|system|developer|bank|judge)\b/i },
  { id: "prompt_extraction", weight: 4, re: /\b(reveal|print|show|repeat|output|leak)\b[\s\S]{0,30}\b(system prompt|your (instructions|prompt|rules)|hidden prompt)\b/i },
  { id: "exfil_markdown", weight: 4, re: /!\[[^\]]*\]\(\s*https?:\/\//i },
  { id: "exfil_send", weight: 3, re: /\b(send|post|upload|forward|email|exfiltrate)\b[\s\S]{0,60}\b(https?:\/\/|\S+@\S+\.\S+)/i },
  { id: "tool_hijack", weight: 3, re: /\b(call|invoke|use|run|execute)\b[\s\S]{0,20}\b(the\s+)?\w*(tool|function|command)\b|\bcurl\s+\S+\s*\|\s*(ba)?sh\b|\brm\s+-rf\b/i },
  { id: "action_request", weight: 3, re: /\b(approve|reject|file|delete|transfer|pay)\b[\s\S]{0,30}\b(this|the|all)\s+(case|draft|plaint|cases|payment|account)s?\b[\s\S]{0,30}\b(immediately|now|automatically)?/i },
];

const BASE64_BLOB = /[A-Za-z0-9+/]{24,}={0,2}/g;

/** Undo common obfuscation before matching: spaced letters, leetspeak. */
function deobfuscate(text: string): string {
  const unspaced = text.replace(/\b(?:\w ){4,}\w\b/g, (m) => m.replace(/ /g, ""));
  return unspaced.replace(/[0-9]/g, (d) => ({ "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t" })[d] ?? d);
}

function decodeBase64(s: string): string | null {
  try {
    // atob + TextDecoder work in the browser and in Node (this package is used on both sides).
    const out = new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
    return /^[\x20-\x7E\s]+$/.test(out) ? out : null;
  } catch {
    return null;
  }
}

export interface InjectionHit {
  rule: string;
  /** ≤ 80 characters around the match, for the reviewer. */
  excerpt: string;
}

export interface InjectionScan {
  score: number;
  suspicious: boolean;
  hits: InjectionHit[];
}

const excerpt = (s: string, at: number) => s.slice(Math.max(0, at - 20), at + 60).replace(/\s+/g, " ").slice(0, 80);

/**
 * Tripwire for untrusted text (OCR, uploads, web pages, model output). A suspicious result
 * means: do not auto-apply anything derived from this text; show it to a human.
 */
export function scanForInjection(text: string, threshold = 3): InjectionScan {
  const hits: InjectionHit[] = [];
  let score = 0;
  if (stripInvisible(text) !== text) {
    hits.push({ rule: "invisible_chars", excerpt: "(hidden characters removed)" });
    score += 1;
  }
  const clean = stripInvisible(text);
  const variants = [clean, deobfuscate(clean)];
  for (const blob of clean.match(BASE64_BLOB) ?? []) {
    const decoded = decodeBase64(blob);
    if (decoded) variants.push(decoded);
  }
  const seen = new Set<string>();
  for (const rule of RULES) {
    for (const v of variants) {
      const m = rule.re.exec(v);
      if (m && !seen.has(rule.id)) {
        seen.add(rule.id);
        score += rule.weight;
        hits.push({ rule: rule.id, excerpt: excerpt(v, m.index) });
      }
    }
  }
  return { score, suspicious: score >= threshold, hits };
}

/** Random boundary marker; data is escaped so it can never close the block itself. */
export function wrapUntrusted(label: string, text: string, boundary = randomHex(8)): { text: string; boundary: string } {
  if (!/^[a-z][a-z0-9_]{0,30}$/.test(label)) throw new Error("Invalid label");
  const open = `<untrusted_${label}_${boundary}>`;
  const close = `</untrusted_${label}_${boundary}>`;
  const body = text.split(boundary).join("[boundary removed]");
  return { text: `${open}\n${body}\n${close}`, boundary };
}

export interface OutputCheck {
  ok: boolean;
  reasons: string[];
}

/** Checks model output before it is stored, rendered or acted on. */
export function checkModelOutput(output: string, opts: { canary?: string; allowUrls?: boolean } = {}): OutputCheck {
  const reasons: string[] = [];
  if (opts.canary && output.includes(opts.canary)) reasons.push("canary_leak");
  if (/!\[[^\]]*\]\([^)]*\)/.test(output)) reasons.push("markdown_image");
  if (!opts.allowUrls && /\bhttps?:\/\/|\bwww\.\S+\.\w{2,}/i.test(output)) reasons.push("url");
  if (stripInvisible(output) !== output) reasons.push("invisible_chars");
  if (scanForInjection(output).suspicious) reasons.push("injection_text");
  return { ok: reasons.length === 0, reasons };
}

/** Secret marker for system prompts; its appearance in output means the prompt leaked. */
export function makeCanary(): string {
  return `CANARY-${randomHex(8)}`;
}

function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}
