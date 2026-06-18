// Multi-language for the AI: the client passes the user's language, and the
// generative endpoints (clarify / plan / decompose / strategise) ask Claude to
// answer in it. English is the default and needs no instruction. Triage is
// deliberately excluded: it echoes the user's own line text back, so translating
// it would break the client's exact-text matching.

// Allowlisted so the `language` field (which goes into the prompt) can never be
// used to inject arbitrary instructions. English is the implicit default.
const ALLOWED = ['Italian', 'Spanish', 'French'] as const;

/** Validate the language from a request body, or undefined (English / unknown). */
export function parseLanguage(raw: unknown): string | undefined {
  return typeof raw === 'string' && (ALLOWED as readonly string[]).includes(raw) ? raw : undefined;
}

/** Append a "respond in this language" instruction to a system prompt, if set. */
export function withLanguage(systemPrompt: string, language?: string): string {
  return language ? `${systemPrompt} Write every word you return to the user in ${language}.` : systemPrompt;
}
