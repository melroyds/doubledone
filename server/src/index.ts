// DoubleDone AI backend (Cloudflare Worker).
// Holds the Anthropic key as a Worker secret and is the only thing that calls
// Claude. The app talks to this, never to Anthropic directly. Endpoints land
// here as they are built; for now a health check that proves the key is wired
// without ever revealing it.

export interface Env {
  ANTHROPIC_API_KEY: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === '/health') {
      // Reports whether the key is present, never the key itself.
      return Response.json({ ok: true, hasKey: Boolean(env.ANTHROPIC_API_KEY) });
    }

    return new Response('doubledone-ai', { status: 200 });
  },
} satisfies ExportedHandler<Env>;
