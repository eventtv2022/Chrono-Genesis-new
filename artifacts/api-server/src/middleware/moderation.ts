// ── Content Moderation ────────────────────────────────────────────────────────
// Multi-layer pre-moderation: US/EU/China/RU frameworks.
// This is a keyword-based first line of defense; extensible to a paid API
// (OpenAI Moderation, Azure Content Safety, AWS Comprehend) via MODERATION_API_KEY.

// Patterns that trigger a block across jurisdictions.
// Deliberately non-exhaustive — expand via MODERATION_BLOCK_KEYWORDS env var.
const BLOCK_PATTERNS: RegExp[] = [
  // Terrorism / extremism (global)
  /\b(isis|isil|игил|аль-?каида|al-?qaeda|hezbollah|хезболла|jihad|джихад|terrorist|терроризм)\b/i,
  // Child safety (COPPA / DSA / CSAM)
  /\b(csam|child\s+porn|детская порнография|несовершеннолетн.{0,10}секс)\b/i,
  // Hate speech / genocide (EU DSA / ICCPR)
  /\b(kill\s+all|нацист|nazi|death\s+to\s+(jews?|muslims?|blacks?)|геноцид|holocaust\s+denial)\b/i,
  // Incitement to violence
  /\b(bomb\s+(threat|school|market|subway)|взорвать|совершить\s+теракт)\b/i,
];

export interface ModerationResult {
  allowed: boolean;
  reason?: string;
}

export function moderateText(text: string): ModerationResult {
  if (!text?.trim()) return { allowed: true };

  for (const pattern of BLOCK_PATTERNS) {
    if (pattern.test(text)) {
      return { allowed: false, reason: "global_content_policy_violation" };
    }
  }

  // Optional: honour extra blocked keywords from env (comma-separated)
  const extra = process.env["MODERATION_BLOCK_KEYWORDS"];
  if (extra) {
    const keywords = extra.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
    const lower = text.toLowerCase();
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        return { allowed: false, reason: "custom_keyword_match" };
      }
    }
  }

  return { allowed: true };
}
