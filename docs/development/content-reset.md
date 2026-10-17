# Controlled content reset

Content reset is an operator action for an explicitly chosen installation. It is
never part of startup, migration, owner recovery or a normal application update.
An uninstalled database is already blank; do not complete owner setup to reset it.

The command preserves all Better Auth identities, linked accounts, sessions and
verification records, Google configuration and version, approved verified owners,
installation/organization identity, OAuth clients and grants, global provider
configuration and club-level domains. It does not rotate keys or change provider
console settings. Retain the original hosting secrets and callback routing.

Content, revisions, media, event activity, responses, member profiles, non-owner
memberships, local provider observations and queued content work are removed.
Global domains are retained while event-bound domains are removed. Automation
execution receipts retain replay metadata but lose content results. The explicit
table classification is in [tables.mjs](../../scripts/reset/tables.mjs); an
unreviewed table or foreign-key dependency blocks the operation.

## Prepare and inventory

1. Complete and verify the replacement application before planning the reset.
2. Stop the application and every worker. Keep them stopped through backup,
   rehearsal and reset. The command refuses active runtime database connections.
3. Capture a consistent PostgreSQL custom dump, all uploads and recovery
   configuration. Include encryption keys, authentication secrets and the exact
   environment configuration in the protected recovery backup.
4. Create a version-1 `manifest.json` with a `files` map from filename to SHA-256.
   Required files are `database.dump`, `uploads.jsonl` and `recovery.env`;
   `database.env` and `services.env` may also be included. The uploads archive
   uses the shared [streaming backup format](../../scripts/hosting/upload-archive.mjs).
   Preserve the whole folder outside the application upload volume.

The standard [hosting backup](hosting.md#recovery-and-validation) captures these
artifacts but normally resumes the site. Stop it again and capture a fresh
consistent backup if writes resumed. A reset must use the database state that was
actually restored and rehearsed.

Use an exact origin matching `APP_URL`. The runtime and migrator configuration
files must identify the same database. The migrator account is required; runtime
credentials cannot perform the reset. Database ownership and the database
`TEMPORARY` privilege are not required. Retained club-domain rows stay in process
memory as PostgreSQL JSON text while the transaction holds exclusive table locks;
their complete values, including timestamp precision, are restored and verified
before commit.

```sh
node scripts/pnpm.mjs content:reset inventory --target https://club.example.org --runtime-env /protected/runtime.env --database-env /protected/migration.env
node scripts/pnpm.mjs content:reset seal --target https://club.example.org --runtime-env /protected/runtime.env --database-env /protected/migration.env --backup /protected/reset-backup
```

`inventory` is a dry run: it prints counts, retained owner identifiers and hashes,
without participant records or credentials. `seal` verifies backup checksums and
binds the manifest to the exact origin, organization, owners, schema and complete
database fingerprint. Record the reviewed owner IDs and schema fingerprint.

## Restore and rehearse

Restore the custom dump to a **new, isolated PostgreSQL 17 database** owned by the
migrator. Never restore over the source or use a schema-cleaning option. Keep the
clone on loopback, with a unique name beginning `rotapress_reset_rehearsal_`.
Do not start application workers or send provider traffic from the clone.

Write a protected rehearsal configuration file whose `MIGRATION_DATABASE_URL`
points only to that clone. Use the source runtime configuration to identify the
reviewed origin; the command deliberately allows a different database only in
rehearsal mode.

```sh
node scripts/pnpm.mjs content:reset rehearse --target https://club.example.org --runtime-env /protected/runtime.env --database-env /protected/rehearsal.env --backup /protected/reset-backup
```

Rehearsal checks that the restored schema and every row match the sealed source,
restores and validates the upload archive in an isolated local directory, and
commits the reset on the clone. Its receipt records unchanged protected hashes
and empty content. A failed restore or mismatched source cannot produce a valid
rehearsal receipt. Keep the original backup intact.

## Apply and recover

Use every retained owner identifier as a separate `--owner` argument:

```sh
node scripts/pnpm.mjs content:reset apply --target https://club.example.org --runtime-env /protected/runtime.env --database-env /protected/migration.env --backup /protected/reset-backup --owner OWNER_ID --schema SCHEMA_FINGERPRINT --rehearsal /protected/reset-backup/rehearsal-ID.json
```

The command rechecks checksums, current uploads, the rehearsal and all identifiers.
It locks the reviewed tables, verifies protected state, performs the explicit
reset in one transaction with restrictive foreign keys, and advances the content
generation. Old browser and automation requests then fail instead of recreating
deleted content. Constraints, triggers and the shared schema remain in place.

Removed files move into `.data/quarantine/content-reset-ID`; they are not deleted.
The protected backup retains a completion receipt. If the database committed but
file completion was interrupted, keep writes stopped and use the generation
printed by the command:

```sh
node scripts/pnpm.mjs content:reset finish-files --target https://club.example.org --runtime-env /protected/runtime.env --database-env /protected/migration.env --backup /protected/reset-backup --generation RESET_ID
```

This resumes file completion only after confirming the committed generation,
protected state and empty content. It does not repeat the database reset.

Restart the application and workers only after completion. Verify the actual
owner can enter administration, content is empty, Google configuration and
callback routing are unchanged, and preserved connections retain their grants.
Observe a **fresh Google sign-in** separately: a matching configuration hash or
an existing session does not prove that flow. Report automated rehearsal,
deployed interface, live Google/MCP checks and user acceptance independently.

Keep recovery backups and quarantined files until the operator explicitly chooses
their retention policy. Neither successful verification nor a reset authorizes
automatic backup deletion.
