import "server-only";
import { eq } from "drizzle-orm";
import { installation, organization } from "../../../db/schema/club";
import type { Database } from "../../infrastructure/database/client";
import type { DatabaseExecutor } from "../authorization/AuthorizationService";
import {
  organizationIdentitySchema,
  type OrganizationSettings,
  type PublicOrganization,
} from "./organization_schemas";
import { staffLoginSchema } from "./club_profile";

export const publicIdentityColumns = {
  name: organization.name,
  tagline: organization.tagline,
  description: organization.description,
  profile: organization.profile,
  locale: organization.locale,
  timezone: organization.timezone,
  accentColor: organization.accentColor,
};

export class OrganizationRepository {
  constructor(private readonly db: Database) {}

  async signInPolicy() {
    const [row] = await this.db
      .select({
        policy: organization.staffAuthPolicy,
        appearance: organization.staffLogin,
      })
      .from(organization)
      .innerJoin(installation, eq(installation.organizationId, organization.id))
      .where(eq(installation.id, 1));
    return {
      staffOnlyGoogle: row?.policy === "google",
      appearance: staffLoginSchema.parse(row?.appearance ?? {}),
    };
  }

  async publicIdentity(
    executor: DatabaseExecutor = this.db,
  ): Promise<PublicOrganization | null> {
    const [identity] = await executor
      .select(publicIdentityColumns)
      .from(organization)
      .innerJoin(installation, eq(installation.organizationId, organization.id))
      .where(eq(installation.id, 1))
      .limit(1);
    // Stored values were validated at the write boundary; parse protects imported records too.
    if (!identity) return null;
    return organizationIdentitySchema.parse(identity);
  }

  async settings(organizationId: string, executor: DatabaseExecutor = this.db) {
    const [settings] = await executor
      .select({
        ...publicIdentityColumns,
        staffAuthPolicy: organization.staffAuthPolicy,
        staffLogin: organization.staffLogin,
      })
      .from(organization)
      .where(eq(organization.id, organizationId));
    return settings;
  }

  async update(
    organizationId: string,
    settings: OrganizationSettings,
    executor: DatabaseExecutor,
  ): Promise<void> {
    await executor
      .update(organization)
      .set({ ...settings, updatedAt: new Date() })
      .where(eq(organization.id, organizationId));
  }
}
