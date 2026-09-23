import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { user } from "../../../db/schema/auth";
import { organization } from "../../../db/schema/club";
import { memberProfile } from "../../../db/schema/member-profile";
import { formSubmission, formVersion } from "../../../db/schema/forms";
import { AuditRepository } from "../../core/audit/AuditRepository";
import {
  DomainError,
  requireVerifiedActor,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import { MembershipRepository } from "./MembershipRepository";
import { formDefinitionSchema } from "../forms/form_schemas";
import {
  profileSchema,
  saveProfileSchema,
  type AccountWorkspace,
} from "./profile_schemas";

export class MemberAccountService {
  private readonly memberships: MembershipRepository;
  constructor(private readonly db: Database) {
    this.memberships = new MembershipRepository(db);
  }

  private async scope(actor: TrustedActor) {
    requireVerifiedActor(actor);
    const organizationId = await this.memberships.installedOrganization();
    if (!organizationId)
      throw new DomainError(
        "SETUP_REQUIRED",
        "The club is not ready yet.",
        409,
      );
    return organizationId;
  }

  async workspace(actor: TrustedActor): Promise<AccountWorkspace> {
    const organizationId = await this.scope(actor);
    const [saved] = await this.db
      .select()
      .from(memberProfile)
      .where(
        and(
          eq(memberProfile.organizationId, organizationId),
          eq(memberProfile.userId, actor.userId),
        ),
      );
    const [identity] = await this.db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, actor.userId));
    const rows = await this.db
      .select({
        id: formSubmission.id,
        status: formSubmission.status,
        createdAt: formSubmission.createdAt,
        definition: formVersion.definition,
      })
      .from(formSubmission)
      .innerJoin(
        formVersion,
        and(
          eq(formVersion.id, formSubmission.versionId),
          eq(formVersion.organizationId, organizationId),
          eq(formVersion.formId, formSubmission.formId),
        ),
      )
      .where(
        and(
          eq(formSubmission.organizationId, organizationId),
          eq(formSubmission.submittedByUserId, actor.userId),
        ),
      )
      .orderBy(desc(formSubmission.createdAt))
      .limit(50);
    return {
      email: actor.email,
      authMethod: actor.authMethod,
      version: saved?.version ?? 0,
      profile: saved
        ? profileSchema.parse(saved.profile)
        : {
            displayName: identity?.name ?? "",
            phone: "",
            bio: "",
            interests: "",
            locale: "en",
          },
      responses: rows.map((row) => ({
        id: row.id,
        title: formDefinitionSchema.parse(row.definition).title,
        status: row.status,
        receivedAt: row.createdAt.toISOString(),
      })),
    };
  }

  async save(actor: TrustedActor, input: unknown) {
    const values = saveProfileSchema.parse(input);
    const organizationId = await this.scope(actor);
    await this.db.transaction(async (tx) => {
      await tx
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.id, organizationId))
        .for("update");
      const [current] = await tx
        .select()
        .from(memberProfile)
        .where(
          and(
            eq(memberProfile.organizationId, organizationId),
            eq(memberProfile.userId, actor.userId),
          ),
        );
      if ((current?.version ?? 0) !== values.expectedVersion)
        throw new DomainError(
          "PROFILE_CHANGED",
          "Your profile changed in another tab. Reload it before saving.",
          409,
        );
      await tx
        .insert(memberProfile)
        .values({
          organizationId,
          userId: actor.userId,
          profile: values.profile,
        })
        .onConflictDoUpdate({
          target: [memberProfile.organizationId, memberProfile.userId],
          set: {
            profile: values.profile,
            version: (current?.version ?? 0) + 1,
            updatedAt: new Date(),
          },
        });
      await new AuditRepository().record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: "member.profile_updated",
      });
    });
    return this.workspace(actor);
  }
}
