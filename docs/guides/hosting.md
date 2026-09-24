# Host your club

RotaPress uses a portable Docker installation. Your website, PostgreSQL database,
uploads and background tasks run together. You do not create database tables,
enter database passwords or run migration commands yourself.

## Install on a server

Use a Linux server with **Docker Compose and Node.js 24**, a domain pointing to
that server, and a verified email sender from Resend or your SMTP provider.
Ports 80 and 443 must be available. The server can come from any provider that
supports Docker; RotaPress does not require a Railway account.

After cloning the repository, run:

```sh
node scripts/host.mjs
```

The assistant asks for your domain, owner email and email sender. It generates
and privately saves the remaining settings, then asks before starting the site.
Docker builds the application; you do not install its packages locally.

The installer handles:

- PostgreSQL 17, separate database accounts and automatic forward migrations.
- Persistent database and upload volumes.
- HTTPS certificates and renewal through Caddy.
- Background notifications, imports and scheduled publication.
- An expiring private setup link for the nominated owner.

Open the link saved in the displayed `setup-link.txt` file, verify the code sent
to your owner inbox, and introduce your club. The link carries the installation
claim; there is no separate claim to paste. It grants no access without verified
owner identity. In administration, choose **Website → Templates** to start your
Rotary or Rotaract website as a draft.

Email must work before the first owner signs in. The sender appears afterward
in **Integrations → Email** as server configuration, with credentials hidden.
You can add a different sender in administration later. See
[email setup](email-setup.md) for sender verification and provider requirements.
The hosting recipe contains no development email service.

## Choose where it runs

| Hosting style | Installation path |
| --- | --- |
| A Docker VPS from your preferred provider | Run the assistant above; database and HTTPS are included |
| Your own Linux server or virtual machine | Use the same assistant and point your domain to the server |
| A Docker platform with its own reverse proxy | Use the same application and PostgreSQL containers with the [container contract](../development/hosting.md); let the platform handle HTTPS |
| Railway, Render or another container host | Deploy the Dockerfile with PostgreSQL 17, a persistent upload disk and protected settings using the [container contract](../development/hosting.md) |

The last two paths require the platform's initial service/domain configuration.
RotaPress handles database roles, migrations and jobs after startup. These are
portable deployment options, not claims of live acceptance on every provider.
A static website host or ephemeral filesystem cannot run this installation.

The installer uses the Docker server you run it on. It does not rent a server,
create cloud accounts, change DNS or push your repository. Start with a separate
test domain and synthetic club content while evaluating this pre-release.

## Everyday operation

```sh
node scripts/host.mjs status
node scripts/host.mjs logs
node scripts/host.mjs stop
node scripts/host.mjs start
```

Stopping preserves data. Starting applies only pending migrations before serving
requests. A failed migration prevents the new application from starting; it never
resets the database. Starting an installed club preserves its owner.

To renew an unfinished owner's expired setup link:

```sh
node scripts/host.mjs link
```

An ordinary restart does not extend the claim's one-hour expiry. Renewing the
link cannot reopen a completed installation or replace its owner.

## Updates and backups

```sh
node scripts/host.mjs backup
```

RotaPress briefly pauses website writes, backs up the database, uploads and
recovery settings, then resumes the site. The displayed folder includes private
data, encryption keys and email credentials. Copy the complete folder to a
separate protected location. A copy on the same server cannot survive losing that
server. Backups are operator-triggered; they are not scheduled or copied off-site
automatically.

After obtaining the release you intend to run in your checkout:

```sh
node scripts/host.mjs update
```

This backs up first, rebuilds your checkout and applies new migrations. It does
not fetch code or push to Git. Allow a short interruption during backup/restart.
If an update fails, keep the backup and inspect logs; do not delete database
volumes or run older code against a newer schema blindly.

To restore, clone a compatible release on a fresh server, copy the complete
backup folder there and run:

```sh
node scripts/host.mjs restore /path/to/backup-folder
node scripts/host.mjs start
```

Restore verifies checksums and requires an empty database and upload volume. It
refuses an existing installation. Point your domain to the restored server before
serving visitors. Recovery retains the original encryption/authentication keys;
the files alone cannot recover encrypted integrations.

## If setup stops

- **Docker unavailable:** start Docker, then rerun the command.
- **HTTPS unavailable:** check your domain and reachability on ports 80/443.
- **Email unavailable:** check the verified sender and credentials.
- **Migration failed:** inspect `node scripts/host.mjs logs`; data is retained.

Private settings live under `.local/hosting/rotapress-hosted/`, ignored by Git and
the Docker build. Protect this directory. For a second isolated installation,
use a distinct `ROTAPRESS_STACK` beginning with `rotapress-` and separate ports
or a separate server.

The [roadmap](../development/roadmap.md) lists remaining release verification.
Local container checks cannot establish real inbox delivery or public certificate
issuance for your domain.
