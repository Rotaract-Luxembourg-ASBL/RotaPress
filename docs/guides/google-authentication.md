# Google sign-in integration

Manage Google at **Integrations → Google sign-in**, `/admin/integrations/google`.
The integration uses the existing Better Auth identity system. Google authentication
does not approve membership, assign a role or grant access to an event or guest record.

## Configure and verify

1. Use a Google OAuth **Web application** client belonging to the club. Configure
   its consent screen and permitted test users when the Google project is in testing.
2. Copy the exact redirect URI shown by RotaPress into Google's authorized redirect
   URIs. For the default local app it is
   `http://127.0.0.1:3000/api/auth/callback/google`. The origin comes from the
   installation's `APP_URL`, not an untrusted request header or an editable form field.
3. A recently signed-in owner enters the client ID and secret and reviews the save.
   Saving keeps Google disabled. The secret is write-only and clears from the form
   after a successful save. A changed client ID requires a new secret.
4. Review **Enable Google sign-in**. This exposes the sign-in option; it does not
   claim that Google has accepted the credentials.
5. **Verify with Google** starts the normal Better Auth redirect flow. Complete the
   real Google consent/sign-in and return to the integration. Only a successful
   callback and session creation can record a verification time.

If Google-only staff access is desired, the owner first signs in successfully using
the current Google configuration, then changes the staff policy in Settings. The
server rechecks the current provider revision inside the settings transaction.
Email sign-in remains available for guests; an email session cannot satisfy the
Google-only staff policy. The protected local owner recovery procedure remains in
[local development](../development/local-development.md).

Google-only policy removes the email form from `/sign-in` and staff destinations
such as `/sign-in?next=/admin`. Member and guest entry points retain email codes.
The staff screen shows the published club identity and explains owner approval.
In **Settings → Sign-in & security**, customize its heading, welcome message,
workspace label and Google button (light, dark or neutral; rounded, pill or square).
The Google mark and sign-in wording are retained. These settings save immediately;
public logo changes still follow Website publication.

### Managed accounts or personal Gmail

In **Integrations → Google sign-in**, leave **Managed Google domain** empty to
accept any Google account, including Gmail. Enter a domain such as `your-club.example`
to require managed accounts for that domain. Do not include `@` or a URL.
This applies to all Google sign-ins, including member entry points; member/guest
email codes remain a separate access method.

The domain guides Google's account chooser and the pinned Better Auth provider
checks Google's verified `hd` claim. An email suffix alone is insufficient.
Google controls the chooser and may still offer an option to use another account;
that does not bypass the server check. See [Google's hosted-domain documentation](https://developers.google.com/identity/openid-connect/openid-connect#hd-param).

Changing a domain follows the credential review flow and invalidates previous
Google sessions. If staff access is Google-only, first restore email-or-Google
policy using your current Google session, save the domain, enable Google again,
complete a real sign-in with an allowed account, and then restore Google-only.
This preserves a recovery path when domain or credential settings are wrong.
Membership and staff approval are always separate.

## Permissions, credentials and lifecycle

- Staff with `integrations.manage` can read connection status and setup details.
  Credential/lifecycle changes require `ownership.manage`, a verified identity and
  authentication within the last 15 minutes. The server reloads current membership
  after acquiring the same organization lock used by sensitive changes.
- Secrets are AES-256-GCM encrypted with `INTEGRATION_ENCRYPTION_KEY`, bound to the
  organization/provider. APIs return only the client ID, status and `hasSecret`.
  Secrets, OAuth codes, state, tokens and provider responses are not logged or audited.
- Saves use an expected version. Concurrent changes fail without overwriting the
  other owner's configuration. Audit entries record actions and IDs, never credentials.
- Saving, enabling, disabling or removing advances the configuration revision and
  invalidates previous Google sessions and unfinished flows. Email sessions remain
  usable. Existing linked accounts and membership records are retained.
- Every request and scheduled actor check rejects obsolete Google session revisions.
  The library session endpoint also returns no active session for an obsolete Google
  configuration. Credentials cannot be changed while staff policy requires Google;
  the owner must deliberately restore email-or-Google policy first.
- Google credentials are managed only in this integration. Environment credentials
  cannot enable Google or reactivate a disconnected connection. When upgrading an
  older installation that used environment credentials, save them in Integrations
  and keep a verified email owner session until setup is complete. Sessions without
  a recorded provider revision must sign in again.

## OAuth boundaries

The pinned Better Auth implementation owns OAuth state, signed state cookies,
PKCE, code exchange, provider identity verification, account linking and sessions.
For Google authentication, only redirect sign-in and the GET callback are exposed.
Browser-supplied ID tokens, scope overrides, provider metadata and alternate linking
endpoints are rejected. Return URLs are restricted to known local routes. Minimum
Google scopes are `openid`, `email` and `profile`, with online access.

Server-only OAuth state binds each flow to its configuration revision. The callback
must match both its request snapshot and the currently enabled configuration before
user/link changes and again before session creation. Better Auth can perform the
code exchange before the application revision check; a stale flow cannot create an
accepted application session. Revision checks after session creation also close a
concurrent-disable race. A configuration verification timestamp uses a matching
enabled revision and is recorded only after session creation.

Google must report a verified email. Automatic linking requires the local email to
be verified and to match the Google address; a linked account does not turn an
email-authenticated session into a Google session. Password endpoints remain disabled.
Existing OTP hashing, expiry, attempt limits, origin checks, bounded request bodies,
database rate limits and private/no-store responses continue to apply.

## Troubleshooting

If verification fails, compare the exact callback URL, confirm that the Google
client is a Web application, and check its consent-screen audience or test-user
list. For managed accounts, check the configured domain and use an account from
that domain. After changing credentials or domain settings, enable the integration
and complete a new Google sign-in before selecting Google-only staff access.

Verification requires a completed Google callback with your configured client and
account. Saved settings or automated local checks cannot establish that access.
Never paste provider tokens into RotaPress or use them as session credentials.

Official references: [Better Auth Google](https://www.better-auth.com/docs/authentication/google),
[OAuth state](https://www.better-auth.com/docs/concepts/oauth) and
[security options](https://www.better-auth.com/docs/reference/options).
