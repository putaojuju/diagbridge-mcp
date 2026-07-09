const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/sk-[A-Za-z0-9_-]{12,}/g, "[REDACTED_OPENAI_STYLE_KEY]"],
  [/[A-Za-z0-9_\-.]+@[A-Za-z0-9_\-.]+\.[A-Za-z]{2,}/g, "[REDACTED_EMAIL]"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]"],
  [/(password|passwd|pwd|token|secret|api[_-]?key)\s*[:=]\s*[^\s]+/gi, "$1=[REDACTED]"],
];

export function redactText(input: string): string {
  return SECRET_PATTERNS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), input);
}
