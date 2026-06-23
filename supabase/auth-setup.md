# Supabase auth setup (manual dashboard config)

The repo can't hold Supabase project settings, so the auth config DoubleDone's
sign-in depends on is recorded here. Do this once per project.

## You must set up custom SMTP (two reasons)

1. Supabase no longer lets you edit email templates on the built-in email service.
   The dashboard shows "Set up custom SMTP to edit templates". DoubleDone needs to
   edit the template (to send a 6-digit code, see below), so custom SMTP is required.
2. The built-in sender is test-only: a few emails per hour, no deliverability
   guarantees, often spam. Real sign-ins need a real sender regardless.

### Recommended provider: Resend
Free tier covers this easily (3,000/month). Steps:
1. Create a resend.com account.
2. Create an API key (starts with `re_`).
3. Supabase -> Authentication -> Emails -> SMTP Settings -> enable custom SMTP:
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: the Resend API key
   - Sender email: `onboarding@resend.dev` to start (see note), later `noreply@doubledone.app`
   - Sender name: `DoubleDone`
4. Save. The "set up SMTP to edit templates" banner disappears; templates become editable.

Note on sender: without a verified domain, Resend only sends FROM `onboarding@resend.dev`
and only TO your own account email. That is enough to test your own sign-in. To email
anyone, verify the domain (below).

### To send to ANY email address (verify the domain)
1. Resend -> Domains -> Add Domain -> `doubledone.app`.
2. Resend shows DNS records (a DKIM TXT, an SPF TXT, an MX, maybe a return-path). Copy them.
3. Cloudflare -> doubledone.app -> DNS -> add each record exactly as shown. Set any CNAME
   to "DNS only" (grey cloud), NOT proxied (orange cloud), or the email DNS breaks.
4. Resend -> Verify (Cloudflare usually propagates within a few minutes).
5. Supabase -> Authentication -> Emails -> SMTP Settings -> change Sender email to
   `noreply@doubledone.app` (must be on the verified domain) -> Save.
6. Send a code to a different address to confirm.

You do not need a real mailbox for `noreply@`; Resend only sends. Recommended (verified missing on 2026-06-23): add a DMARC
TXT record (`_dmarc` -> `v=DMARC1; p=none;`) for better inbox placement. The free tier
then covers any recipient (3,000/month, 100/day).

## Email templates must send the code, not a link

DoubleDone uses typed 6-digit OTP codes (`verifyOtp({ type: 'email' })`), not magic
links. Once custom SMTP is on, edit these templates under Authentication -> Emails and
put `{{ .Token }}` (the code) in the body instead of `{{ .ConfirmationURL }}` (the link):
- **Magic link or OTP** (fires on sign-in)
- **Confirm sign up** (fires for a brand-new user)

The branded template is in `supabase/email-templates/otp-code.html`, paste that into both. A minimal inline version for reference:

```html
<h2>Your DoubleDone code</h2>
<p>Enter this code to sign in:</p>
<p style="font-size:24px;font-weight:bold;letter-spacing:3px">{{ .Token }}</p>
<p>It expires in an hour. If you didn't request it, ignore this email.</p>
```

After saving, request a NEW code (old emails do not update). Type it into the app and
ignore any link.

## OTP length should be 6
Authentication -> Providers -> Email -> "Email OTP Length" -> set to 6, to match the
app's "6-digit code" copy. The code input accepts up to 10 chars defensively, so a
longer setting still works, but 6 is the intended UX.

## URL configuration (only matters if you ever switch to magic links)
Authentication -> URL Configuration -> set Site URL to https://doubledone.app and add
it to Redirect URLs. Not needed for the typed-code flow, which is what we use.

## If a sign-in gets stuck
A half-created unconfirmed user is harmless; just request a new code. To start clean,
delete the user under Authentication -> Users and retry.
