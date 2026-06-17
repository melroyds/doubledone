// Client side of Bite the Elephant: ask the AI backend to break a dreaded task
// into atomic, time-boxed steps. The Worker URL is public (no secret), so a
// hardcoded fallback keeps the deployed build working; EXPO_PUBLIC_AI_URL
// overrides it for local dev.

const AI_URL = process.env.EXPO_PUBLIC_AI_URL ?? 'https://doubledone-ai.melroy-a02.workers.dev';

export type DecomposedStep = { title: string; minutes: number };

/** Pull steps out of the backend response, defensively (never throws). */
export function parseSteps(data: unknown): DecomposedStep[] {
  const steps = (data as { steps?: unknown } | null)?.steps;
  if (!Array.isArray(steps)) return [];
  return steps
    .filter(
      (s): s is DecomposedStep =>
        s != null &&
        typeof (s as DecomposedStep).title === 'string' &&
        typeof (s as DecomposedStep).minutes === 'number',
    )
    .map((s) => ({ title: s.title, minutes: s.minutes }));
}

/** Break a dreaded task into steps via the AI backend. Throws on a failed call. */
export async function decompose(task: string): Promise<DecomposedStep[]> {
  const res = await fetch(`${AI_URL}/decompose`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ task }),
  });
  if (!res.ok) throw new Error(`decompose failed (${res.status})`);
  return parseSteps(await res.json());
}
