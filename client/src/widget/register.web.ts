// No Android home-screen widget on web; Metro resolves this no-op so the widget library
// never enters the web bundle. See register.ts for the native registration.

/** No-op on web. */
export function registerWidget(): void {}
