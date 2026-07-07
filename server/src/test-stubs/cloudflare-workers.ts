// Minimal stand-in for the workers-runtime-only 'cloudflare:workers' module, so
// node-run vitest can load @cloudflare/workers-oauth-provider (which imports it at
// module scope). The library only uses WorkerEntrypoint for a
// `handler.prototype instanceof WorkerEntrypoint` check, and our handlers are plain
// objects, so an empty class is a faithful double. Wired up in vitest.config.ts;
// never imported by production code.
export class WorkerEntrypoint {}
