# Portable container contract

The [guided installer](../guides/hosting.md) is the default standalone path.
`Dockerfile` is also the artifact for other container hosts; no hosting SDK,
vendor database engine or separate application architecture is used.

## Runtime

- Build the root Dockerfile without database access or deployment secrets.
  Club metadata is resolved when requests arrive.
- Run one application replica. It listens on `PORT` (default 3000), with health
  endpoint `/api/health`. Allow at least 180 seconds for startup/migrations.
- Mount a persistent writable disk at `/app/.data`. Uploads stay private.
- Provide a dedicated **PostgreSQL 17** database named `rotapress` on a private
  network. The standard image/recipe manages this automatically.
- Terminate HTTPS at a trusted proxy. `APP_URL` is the exact public HTTPS origin
  used by Better Auth and mutation origin checks.
- Do not add a separate jobs service. The supervisor executes existing bounded
  batches every 30 seconds after each completed batch. PostgreSQL leases and
  idempotency remain authoritative.

The root supervisor provisions roles and applies Drizzle migrations before
starting web/jobs as UID/GID 10001. Children receive only the restricted runtime
credential and allowed application settings. They do not inherit bootstrap
credentials, the installation master key, setup claim or provider account tokens.
The supervisor needs permission to change volume ownership and launch those
children. Platforms forcing an arbitrary non-root container UID need another
validated bootstrap arrangement before using this image.

## Protected settings

| Variable | Purpose |
| --- | --- |
| `ROTAPRESS_DEPLOYMENT=hosted` | Explicit hosted mode; local/test target guards remain strict |
| `ROTAPRESS_ENVIRONMENT=production` | Rejects development providers and fixtures |
| `APP_URL` | Public HTTPS origin without path/query/credentials |
| `BOOTSTRAP_DATABASE_URL` | Administrator URL ending in `/rotapress`; account must create roles and grant database/schema permissions |
| `ROTAPRESS_HOSTING_KEY` | Stable random 32-byte key as 64 lowercase hex characters; derives independent database/auth/encryption keys |
| `ROTAPRESS_OWNER_EMAIL` | Inbox nominated for initial owner verification |
| `ROTAPRESS_SETUP_CLAIM` | Random 32-byte base64url token; startup stores its hash with one-hour expiry |
| `EMAIL_PROVIDER` | `resend` or `smtp` |
| `EMAIL_REMOTE_DELIVERY_ENABLED=true` | Enables the configured sender |
| `EMAIL_FROM_ADDRESS` and provider credentials | As documented in [email setup](../guides/email-setup.md) |

The assistant generates settings for Compose. For another container platform,
run `node scripts/host.mjs configure` to generate private settings without
starting services and place them in the platform's protected environment fields.
Add the administrator URL supplied by its dedicated PostgreSQL service. Never
put secrets in build arguments, Git, browser code or a public template. Keep the
hosting key stable across updates; changing it is not a rotation procedure.

The default administrator is `rotapress_bootstrap`; other names are accepted.
A managed database whose administrator cannot provision roles or access their
schemas is incompatible with automatic bootstrap. Use the supplied PostgreSQL
container rather than weakening the runtime account. Bootstrap currently
requires a private connection and rejects URL query parameters; public database
TLS options need an explicit configuration change and validation before use.

Startup refuses privileged runtime roles, inherited role memberships, incompatible
database names/versions and mismatched credentials. It never resets an existing
role password. Advisory locks serialize migrations and preserve the normal
audit/revision/installation privilege restrictions.

After startup, deliver this link privately to the nominated owner:

```text
https://your-domain/setup#setup=THE_PRIVATE_CLAIM
```

The browser removes the fragment and exchanges it for an HttpOnly, Secure,
SameSite cookie. The exchange checks the claim; it does not authenticate or grant
membership. Setup still requires the nominated, recently verified identity.
Change only the pending claim to renew an expired link. A restart with the same
claim retains its expiry; completed installations are never reopened.

## Proxy and platform differences

Caddy obtains/renews certificates and overwrites `X-Real-IP` with its peer address.
The app and PostgreSQL have no host ports in `compose.production.yaml`.

`ROTAPRESS_PROXY=trusted` enables per-client authentication rate limits using one
valid `X-Real-IP`. Enable it only when the app is reachable solely through an
edge that overwrites that header. Forwarding chains are ignored. Otherwise leave
`ROTAPRESS_PROXY=none` to keep the conservative shared bucket. Never expose a
trusted-mode app port directly. Validate any additional proxy/CDN trust boundary.

- **Docker VPS:** Compose provisions the app, PostgreSQL, proxy and persistent disks.
- **Coolify/Dokploy or an existing Docker proxy:** retain web/database and volumes,
  omit `https`, and route the platform's HTTPS domain to web port 3000. Preserve
  the private upstream and header rules above.
- **Railway:** use the Dockerfile, PostgreSQL 17 and a `/app/.data` volume. Resend
  uses HTTPS; Railway restricts SMTP by plan. Its edge documents `X-Real-IP`;
  verify no alternate public ingress bypasses that edge.
- **Render or another container host:** provide equivalent database privileges,
  a persistent disk and HTTPS routing. Check managed database permissions before
  choosing that product. Ephemeral/serverless-only plans cannot preserve uploads.

These are contracts, not provider-specific provisioning tools or live acceptance
claims. See official [Caddy HTTPS documentation](https://caddyserver.com/docs/automatic-https),
[Railway volumes](https://docs.railway.com/volumes) and
[Railway outbound networking](https://docs.railway.com/networking/outbound-networking).

## Recovery and validation

`host backup` stops web/jobs while capturing PostgreSQL, an allowlisted flat upload
archive and private recovery settings. It restarts a previously running website
even if backup fails. Only a complete checksummed manifest marks success. There
is no automatic off-site backup.

Restore requires a fresh stack/configuration and checks that its database/uploads
are empty. Imports belong to the migrator so subsequent forward migrations work.
Startup reapplies the reviewed privilege policy instead of importing database-owner ACLs.
It never uses `--clean`, drops schemas or resets an installation. Upload restore
accepts bounded random `.webp` names, verifies contents and creates files
exclusively; archive paths and symlinks cannot overwrite other files.

```sh
docker build -t rotapress:hosting-check .
node scripts/pnpm.mjs exec node scripts/hosting/check.mjs
```

The rehearsal creates unique disposable stacks with loopback test ports and
Caddy's internal test CA. It checks migration replay, role restrictions, claim
expiry/renewal, HTTPS/cookies, persistence, backup/restore and overwrite refusal.
It uses synthetic sender configuration and sends no email. Only its own test
containers/volumes are removed; private archives remain under `.local/hosting/`.
Public TLS and live providers require separate acceptance.
