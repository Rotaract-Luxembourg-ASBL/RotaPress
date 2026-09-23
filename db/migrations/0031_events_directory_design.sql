-- Directory publication is independent from shared website settings publication.
ALTER TABLE club.cms_site
  ADD COLUMN events_directory_draft jsonb,
  ADD COLUMN events_directory_published jsonb,
  ADD COLUMN events_directory_version integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT cms_site_events_directory_version
    CHECK (events_directory_version >= 0);
