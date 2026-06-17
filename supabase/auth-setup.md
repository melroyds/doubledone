# Supabase auth setup (manual dashboard config)

The repo can't hold Supabase project settings, so the auth config that DoubleDone's
sign-in depends on is recorded here. Do this once per project.

## Email templates must send the code, not a link

DoubleDone uses typed 6-digit OTP codes (`verifyOtp({ type: 'email' })`), not magic
links. Supabase's DEFAULT templates email a confirmation URL instead, which our app
cannot use (and the link's redirect is unconfigured, so it goes nowhere).

Fix: Authentication -> Emails. In BOTH the **Confirm signup** and **Magic Link**
templates, send `{{ .Token }}` (the 6-digit code) instead of `{{ .ConfirmationURL }}`.

Minimal body for each:

```html
<h2>Your DoubleDone code</h2>
<p>Enter this code to sign in:</p>
<p style="font-size:24px;font-weight:bold;letter-spacing:3px">{{ .Token }}</p>
<p>It expires in an hour. If you didn't request it, ignore this email.</p>
```

After saving, request a NEW code (old emails do not update). Type it into the app and
ignore any link.

## Which template fires
- New user (first sign-in, `shouldCreateUser: true`) -> "Confirm signup".
- Returning user -> "Magic Link".
Both need `{{ .Token }}`.

## URL configuration (only matters if you ever switch to magic links)
Authentication -> URL Configuration -> set Site URL to https://doubledone.app and add
it to Redirect URLs. Not needed for the typed-code flow, which is what we use.

## If a sign-in gets stuck
A half-created unconfirmed user is harmless; just request a new code. To start clean,
delete the user under Authentication -> Users and retry.
