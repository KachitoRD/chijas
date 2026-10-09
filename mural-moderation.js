export const MURAL_MAX_COMMENT_LENGTH = 500;
export const MURAL_RATE_LIMIT_MS = 10_000;

const EXTERNAL_LINK = /(?:https?:\/\/|www\.)\S+|\b(?:t\.me|telegram\.me|wa\.me|whatsapp\.com|chat\.whatsapp\.com)(?:[/?#:]|\b)/i;
const DOMAIN = /\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.(?:[a-z]{2,})(?:\/\S*)?/i;

export function normalizeBlockedTerms(value) {
  if (typeof value !== "string") throw new TypeError("La lista de bloqueo debe ser texto.");
  if (value.length > 2000) throw new Error("La lista de bloqueo no puede superar 2000 caracteres.");
  const terms = [];
  const seen = new Set();
  for (const rawTerm of value.split(/\r?\n/)) {
    const term = rawTerm.normalize("NFKC").trim();
    if (!term) continue;
    if (term.length > 40) throw new Error("Cada término puede tener hasta 40 caracteres.");
    const key = term.toLocaleLowerCase("es");
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
  }
  if (terms.length > 40) throw new Error("La lista admite hasta 40 términos.");
  return terms.join("\n");
}

export function validateMuralComment(value, blockedTerms = []) {
  if (typeof value !== "string") return { valid: false, reason: "invalid" };
  const text = value.replace(/\r\n?/g, "\n").normalize("NFKC").trim();
  if (!text) return { valid: false, reason: "empty" };
  if (text.length > MURAL_MAX_COMMENT_LENGTH) return { valid: false, reason: "too-long" };
  if (EXTERNAL_LINK.test(text) || DOMAIN.test(text)) return { valid: false, reason: "external-link" };

  const normalized = text.toLocaleLowerCase("es");
  const blocked = Array.isArray(blockedTerms)
    ? blockedTerms.filter(term => typeof term === "string")
      .map(term => term.normalize("NFKC").trim().toLocaleLowerCase("es"))
      .filter(Boolean)
    : [];
  if (blocked.some(term => normalized.includes(term))) return { valid: false, reason: "blocked-term" };
  return { valid: true, text };
}
