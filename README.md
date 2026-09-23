# RotaPress

An open-source website and club management platform for clubs and nonprofit
organizations. Publish a website, manage membership, collect responses and run
events from one application, with one club per installation.

**Status: pre-release, under active development.** The application runs locally;
production deployment and full backup/restore acceptance are still pending.
See the [roadmap and limitations](docs/development/roadmap.md).

## What you can do

- **Build your website:** visual page editing, editable Rotary and Rotaract
  templates, shared headers and menus, language variants, private drafts and
  deliberate publication.
- **Manage your community:** membership applications, approval, scoped staff
  permissions, a private member portal and a published community directory.
- **Collect responses:** reusable forms, conditional questions, multi-page forms,
  private responses, CSV exports and queued notifications.
- **Organize events:** event pages, teams, native free registration, packages,
  guest access and prize showcases. Draw tools are demonstrations only.
- **Maintain calendars:** recurring activities, public/member audiences, calendar
  imports, subscriptions and reminders.
- **Connect services:** optional Google sign-in, Luma, SMTP and Resend integrations.
  Local development uses email verification through Mailpit and needs no cloud account.

Google, Luma, remote calendar feeds and external email still need real-provider
verification. Native paid checkout, check-in and production draw activation are
not supported. Configuring a domain does not provision hosting, DNS or HTTPS.

## Run locally

You need Git, Node.js 24 and Docker with Compose. On Windows, use Docker Desktop's
Linux container engine. Installation downloads pinned pnpm and Node runtimes
inside the project; it does not replace system-wide installations.

```sh
git clone https://github.com/Rotaract-Luxembourg-ASBL/RotaPress.git
cd RotaPress
node scripts/pnpm.mjs install
node scripts/pnpm.mjs setup
node scripts/pnpm.mjs dev
```

If you already have a checkout, start with the install command. Use the wrapper
shown above: plain `pnpm setup` is pnpm's own command, not this project's setup.

1. Open [owner setup](http://127.0.0.1:3000/setup).
2. Sign in as the nominated synthetic owner, `local-owner@example.test`, using
   the email verification code in [Mailpit](http://127.0.0.1:18025).
3. Read `.local/setup-claim.txt` on your own machine, enter that one-hour claim
   in the setup form, and complete your club's details. Keep the claim private.
4. Open [administration](http://127.0.0.1:3000/admin) and create your content.

Setup creates separate development and test databases, local secrets and protected
owner setup. It preserves existing data and cannot claim an installed club again.
The website defaults to `http://127.0.0.1:3000`; all local services bind to loopback.
See [local development](docs/development/local-development.md) for configuration,
alternative ports, stopping services and owner recovery.

## Verify a change

After local setup, install the test browser once and run the checks:

```sh
node scripts/pnpm.mjs browser:install
node scripts/pnpm.mjs verify
node scripts/pnpm.mjs doctor
```

Verification runs the 800-line file guard, strict TypeScript, lint, focused tests
against PostgreSQL, a production build and two principal Chromium journeys.
Tests use a dedicated disposable database, separate from your development data.
Provider fixtures and Mailpit checks do not establish live integration support.
See [testing](docs/development/testing.md) for focused commands.

## Documentation

- [Documentation index](docs/README.md): website, members, forms, events and integrations.
- [Local development](docs/development/local-development.md): installation and everyday operation.
- [Architecture](docs/development/architecture.md): code layout, security and extension boundaries.
- [Roadmap](docs/development/roadmap.md): remaining work and current limitations.
- [Contributing](CONTRIBUTING.md): development practices and pull requests.
- [Code of conduct](CODE_OF_CONDUCT.md) and [security reporting](SECURITY.md).

## Built with

One Next.js App Router application using TypeScript, PostgreSQL 17, Drizzle with
the `pg` driver, Better Auth and Puck. Local files store uploads; PostgreSQL stores
durable jobs; Mailpit captures development email. Exact versions live in
[package.json](package.json), [pnpm-lock.yaml](pnpm-lock.yaml) and
[compose.yaml](compose.yaml).

## License

RotaPress code and project documentation use the [MIT license](LICENSE), copyright
Rotaract Luxembourg ASBL. Bundled photographs and Rotary/Rotaract marks have
separate terms: see [asset notices](public/templates/BRAND_ASSETS.md) and
[photograph credits](docs/guides/website-kits.md#images-and-identity). The code
license does not grant trademark rights or imply endorsement.
