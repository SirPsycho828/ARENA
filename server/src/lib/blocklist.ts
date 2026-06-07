interface BlocklistEntry {
  pattern: RegExp;
  category: 'inappropriate_language' | 'personal_information' | 'extremist_content';
}

/**
 * Normalize leetspeak substitutions and repeated chars.
 */
function normalize(text: string): string {
  let s = text.toLowerCase();
  s = s.replace(/@/g, 'a')
       .replace(/0/g, 'o')
       .replace(/1/g, 'i')
       .replace(/3/g, 'e')
       .replace(/\$/g, 's')
       .replace(/5/g, 's')
       .replace(/7/g, 't');
  // Collapse repeated chars beyond 2
  s = s.replace(/(.)\1{2,}/g, '$1$1');
  return s;
}

const BLOCKLIST: BlocklistEntry[] = [
  // --- Inappropriate Language ---
  // Racial/ethnic slurs
  { pattern: /\bn+[i1!]+g+[e3]*r+s?\b/i, category: 'inappropriate_language' },
  { pattern: /\bk+[i1!]+k+e+s?\b/i, category: 'inappropriate_language' },
  { pattern: /\bsp+[i1!]+c+s?\b/i, category: 'inappropriate_language' },
  { pattern: /\bch+[i1!]+n+k+s?\b/i, category: 'inappropriate_language' },
  { pattern: /\bw+[e3]+t+b+a+c+k+s?\b/i, category: 'inappropriate_language' },
  { pattern: /\bc+o+o+n+s?\b/i, category: 'inappropriate_language' },
  // Homophobic slurs
  { pattern: /\bf+[a@]+g+[o0]*t+s?\b/i, category: 'inappropriate_language' },
  { pattern: /\bd+[y1]+k+e+s?\b/i, category: 'inappropriate_language' },
  { pattern: /\btr+[a@]+n+n+[y1i]+e*s?\b/i, category: 'inappropriate_language' },
  // Explicit sexual terms (most egregious only — OpenAI catches the rest)
  { pattern: /\bc+u+n+t+s?\b/i, category: 'inappropriate_language' },
  { pattern: /\brape[ds]?\b/i, category: 'inappropriate_language' },
  { pattern: /\bmolest/i, category: 'inappropriate_language' },
  { pattern: /\bpedophil/i, category: 'inappropriate_language' },

  // --- Personal Information ---
  { pattern: /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/, category: 'personal_information' },  // US phone
  { pattern: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/, category: 'personal_information' },  // SSN
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, category: 'personal_information' },  // Email
  { pattern: /\bdoxx?(ing|ed)?\b/i, category: 'personal_information' },

  // --- Extremist Content ---
  { pattern: /\bisis\b/i, category: 'extremist_content' },
  { pattern: /\bal[\s-]?qaeda\b/i, category: 'extremist_content' },
  { pattern: /\bjihad(i|ist)?\b/i, category: 'extremist_content' },
  { pattern: /\bheil\s+hitler\b/i, category: 'extremist_content' },
  { pattern: /\bsieg\s+heil\b/i, category: 'extremist_content' },
  { pattern: /\b(white|aryan)\s+(power|supremac)/i, category: 'extremist_content' },
  { pattern: /\b14\s*88\b/, category: 'extremist_content' },
  { pattern: /\bgas\s+the\s+jews\b/i, category: 'extremist_content' },
  { pattern: /\bkill\s+(all\s+)?(jews|muslims|blacks|whites|gays)\b/i, category: 'extremist_content' },
];

export type ModerationCategory = BlocklistEntry['category'];

/**
 * Synchronous blocklist check. Returns the first matching category or null.
 */
export function checkBlocklist(text: string): ModerationCategory | null {
  const normalized = normalize(text);

  for (const entry of BLOCKLIST) {
    if (entry.pattern.test(text) || entry.pattern.test(normalized)) {
      return entry.category;
    }
  }
  return null;
}
