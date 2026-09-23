-- Forward-only source identity backfill. Pause old application/workers before applying.
-- Existing guest/run/job UUIDs and explicit guest grants are never rebuilt.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM club.luma_api_event a
    LEFT JOIN club.luma_event_link l
      ON l.event_id = a.event_id AND l.organization_id = a.organization_id
    WHERE l.published_url IS NULL
  ) THEN
    RAISE EXCEPTION 'Luma source migration requires each legacy API identity to retain its published registration URL';
  END IF;
END;
$$;
--> statement-breakpoint
INSERT INTO club.event_package_source (event_id, organization_id, label, url)
SELECT event_id, organization_id, 'Registration destination',
  replace(published_url, 'https://lu.ma/', 'https://luma.com/')
FROM club.luma_event_link WHERE published_url IS NOT NULL
ON CONFLICT (event_id, url) DO NOTHING;
--> statement-breakpoint
ALTER TABLE club.luma_api_event ADD COLUMN source_id uuid;
--> statement-breakpoint
ALTER TABLE club.luma_guest_projection ADD COLUMN source_id uuid;
--> statement-breakpoint
ALTER TABLE club.luma_sync_run ADD COLUMN source_id uuid;
--> statement-breakpoint
ALTER TABLE club.luma_reconciliation_job ADD COLUMN source_id uuid;
--> statement-breakpoint
ALTER TABLE club.luma_reconciliation_job ADD COLUMN source_version integer;
--> statement-breakpoint
UPDATE club.luma_api_event a SET source_id = s.id
FROM club.luma_event_link l JOIN club.event_package_source s
  ON s.event_id = l.event_id AND s.organization_id = l.organization_id
  AND s.url = replace(l.published_url, 'https://lu.ma/', 'https://luma.com/')
WHERE a.event_id = l.event_id AND a.organization_id = l.organization_id;
--> statement-breakpoint
UPDATE club.luma_guest_projection g SET source_id = a.source_id
FROM club.luma_api_event a
WHERE g.event_id = a.event_id AND g.organization_id = a.organization_id;
--> statement-breakpoint
UPDATE club.luma_sync_run r SET source_id = a.source_id
FROM club.luma_api_event a
WHERE r.event_id = a.event_id AND r.organization_id = a.organization_id;
--> statement-breakpoint
UPDATE club.luma_reconciliation_job j SET source_id = a.source_id, source_version = s.version
FROM club.luma_api_event a JOIN club.event_package_source s ON s.id = a.source_id
WHERE j.event_id = a.event_id AND j.organization_id = a.organization_id;
--> statement-breakpoint
-- Child mappings are populated while the old event scope is still unique.
ALTER TABLE club.luma_guest_projection DROP CONSTRAINT luma_guest_projection_event_id_organization_id_luma_api_event_event_id_organization_id_fk;
--> statement-breakpoint
ALTER TABLE club.luma_sync_run DROP CONSTRAINT luma_sync_run_event_id_organization_id_luma_api_event_event_id_organization_id_fk;
--> statement-breakpoint
ALTER TABLE club.luma_reconciliation_job DROP CONSTRAINT luma_reconciliation_job_event_id_organization_id_luma_api_event_event_id_organization_id_fk;
--> statement-breakpoint
ALTER TABLE club.luma_api_event DROP CONSTRAINT luma_api_event_scope;
--> statement-breakpoint
ALTER TABLE club.luma_api_event DROP CONSTRAINT luma_api_event_pkey;
--> statement-breakpoint
ALTER TABLE club.luma_api_event ALTER COLUMN source_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE club.luma_api_event ADD PRIMARY KEY (source_id);
--> statement-breakpoint
ALTER TABLE club.luma_api_event ADD CONSTRAINT luma_api_event_scope UNIQUE (source_id, event_id, organization_id);
--> statement-breakpoint
ALTER TABLE club.luma_guest_projection ALTER COLUMN source_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE club.luma_sync_run ALTER COLUMN source_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE club.luma_reconciliation_job ALTER COLUMN source_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE club.luma_reconciliation_job ALTER COLUMN source_version SET NOT NULL;
--> statement-breakpoint
ALTER TABLE club.luma_api_event ADD CONSTRAINT luma_api_source_scope
  FOREIGN KEY (source_id, event_id, organization_id) REFERENCES club.event_package_source (id, event_id, organization_id);
--> statement-breakpoint
ALTER TABLE club.luma_guest_projection ADD CONSTRAINT luma_guest_api_source_scope
  FOREIGN KEY (source_id, event_id, organization_id) REFERENCES club.luma_api_event (source_id, event_id, organization_id);
--> statement-breakpoint
ALTER TABLE club.luma_sync_run ADD CONSTRAINT luma_sync_api_source_scope
  FOREIGN KEY (source_id, event_id, organization_id) REFERENCES club.luma_api_event (source_id, event_id, organization_id);
--> statement-breakpoint
ALTER TABLE club.luma_reconciliation_job ADD CONSTRAINT luma_job_api_source_scope
  FOREIGN KEY (source_id, event_id, organization_id) REFERENCES club.luma_api_event (source_id, event_id, organization_id);
--> statement-breakpoint
ALTER TABLE club.luma_guest_projection DROP CONSTRAINT luma_guest_provider_identity;
--> statement-breakpoint
ALTER TABLE club.luma_guest_projection ADD CONSTRAINT luma_guest_provider_identity UNIQUE (source_id, provider_guest_id);
--> statement-breakpoint
CREATE INDEX luma_api_event_index ON club.luma_api_event (event_id);
--> statement-breakpoint
DROP INDEX club.luma_sync_history;
--> statement-breakpoint
CREATE INDEX luma_sync_history ON club.luma_sync_run (source_id, started_at);
--> statement-breakpoint
DROP INDEX club.luma_job_active;
--> statement-breakpoint
CREATE UNIQUE INDEX luma_job_active ON club.luma_reconciliation_job (source_id) WHERE status IN ('pending', 'processing');
--> statement-breakpoint
DROP INDEX club.luma_job_history;
--> statement-breakpoint
CREATE INDEX luma_job_history ON club.luma_reconciliation_job (source_id, created_at);
--> statement-breakpoint
ALTER TABLE club.luma_reconciliation_job DROP CONSTRAINT luma_job_versions;
--> statement-breakpoint
ALTER TABLE club.luma_reconciliation_job ADD CONSTRAINT luma_job_versions
  CHECK (source_version > 0 AND connection_version > 0 AND event_version > 0
    AND registration_version >= 0 AND requested_version > 0 AND link_version >= requested_version);
