// Test-only stand-in for the Workers runtime module 'cloudflare:email' (aliased in vitest.config.ts), so a route
// test can exercise the send_email path. The runtime's real EmailMessage is never imported in tests.
export class EmailMessage {
  constructor(
    public from: string,
    public to: string,
    public raw: string,
  ) {}
}
