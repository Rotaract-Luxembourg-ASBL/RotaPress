import "server-only";
import { and, eq } from "drizzle-orm";
import {
  installation,
  membership,
  organization,
  type MembershipRole,
} from "../../../db/schema/club";
import type { Database } from "../../infrastructure/database/client";
import { DomainError } from "../DomainError";
import { FeatureAvailability } from "../features/FeatureAvailability";
import { featureForCapability } from "../features/feature_catalogue";
export { DomainError } from "../DomainError";

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DatabaseExecutor = Database | Transaction;

/** Constructed only from a validated Better Auth session on the server. */
export type TrustedActor = {
  userId: string;
  email: string;
  emailVerified: boolean;
  sessionId: string;
  authenticatedAt: Date;
  authMethod: "email-otp" | "google" | "unknown";
  authProviderVersion?: string;
};
export type ScheduledIdentity = { actor: TrustedActor; expiresAt: Date };
export type ResolveScheduledActor = (
  sessionId: string,
  userId: string,
) => Promise<ScheduledIdentity | null>;

export type Capability =
  | "admin.access"
  | "members.review"
  | "members.manage"
  | "settings.manage"
  | "integrations.manage"
  | "cms.edit"
  | "cms.publish"
  | "media.manage"
  | "forms.edit"
  | "forms.settings"
  | "submissions.read"
  | "submissions.export"
  | "submissions.manage"
  | "ownership.manage"
  | "events.create"
  | "events.manage"
  | "calendar.manage";

const capabilities: Record<MembershipRole, readonly Capability[]> = {
  owner: [
    "calendar.manage",
    "admin.access",
    "members.review",
    "members.manage",
    "settings.manage",
    "integrations.manage",
    "ownership.manage",
    "cms.edit",
    "cms.publish",
    "media.manage",
    "forms.edit",
    "forms.settings",
    "submissions.read",
    "submissions.export",
    "submissions.manage",
    "events.create",
    "events.manage",
  ],
  administrator: [
    "calendar.manage",
    "admin.access",
    "members.review",
    "members.manage",
    "settings.manage",
    "integrations.manage",
    "cms.edit",
    "cms.publish",
    "media.manage",
    "forms.edit",
    "forms.settings",
    "submissions.read",
    "submissions.export",
    "submissions.manage",
    "events.create",
    "events.manage",
  ],
  editor: [
    "calendar.manage",
    "admin.access",
    "cms.edit",
    "cms.publish",
    "media.manage",
    "forms.edit",
  ],
  member: [],
};

export type StaffAccess = {
  organizationId: string;
  membershipId: string;
  role: MembershipRole;
  capabilities: readonly Capability[];
};

export function requireVerifiedActor(actor: TrustedActor): void {
  if (!actor.emailVerified || !actor.userId || !actor.sessionId) {
    throw new DomainError(
      "VERIFIED_IDENTITY_REQUIRED",
      "Verify your email before continuing.",
      401,
    );
  }
  if (actor.authMethod === "unknown") {
    throw new DomainError(
      "AUTH_METHOD_REQUIRED",
      "Sign out and sign in again using a supported authentication method.",
      401,
    );
  }
}

export function requireRecentActor(actor: TrustedActor): void {
  const age = Date.now() - actor.authenticatedAt.getTime();
  if (!Number.isFinite(age) || age < 0 || age > 15 * 60 * 1000) {
    throw new DomainError(
      "RECENT_AUTH_REQUIRED",
      "Sign out and sign in again before making this sensitive change.",
      401,
    );
  }
}

export class AuthorizationService {
  readonly features: FeatureAvailability;
  constructor(private readonly db: Database) {
    this.features = new FeatureAvailability(db);
  }

  async require(
    actor: TrustedActor,
    capability: Capability,
    executor: DatabaseExecutor = this.db,
  ): Promise<StaffAccess> {
    const current = await this.approved(actor, executor);
    if (!current.capabilities.includes(capability)) {
      throw new DomainError(
        "ACCESS_DENIED",
        "Your current membership does not permit this operation.",
      );
    }
    const feature = featureForCapability(capability);
    if (feature)
      await this.features.require(current.organizationId, feature, executor);
    return current;
  }

  /** Approval and the staff session policy do not grant a feature capability. */
  async approved(
    actor: TrustedActor,
    executor: DatabaseExecutor = this.db,
  ): Promise<StaffAccess> {
    requireVerifiedActor(actor);
    const [current] = await executor
      .select({
        organizationId: organization.id,
        membershipId: membership.id,
        role: membership.role,
        status: membership.status,
        policy: organization.staffAuthPolicy,
      })
      .from(installation)
      .innerJoin(organization, eq(organization.id, installation.organizationId))
      .innerJoin(
        membership,
        and(
          eq(membership.organizationId, organization.id),
          eq(membership.userId, actor.userId),
        ),
      )
      .where(eq(installation.id, 1))
      .limit(1);

    if (!current || current.status !== "approved") {
      throw new DomainError(
        "ACCESS_DENIED",
        "Your current membership does not permit this operation.",
      );
    }
    if (current.policy === "google" && actor.authMethod !== "google") {
      throw new DomainError(
        "GOOGLE_SESSION_REQUIRED",
        "Sign in with Google to use staff administration.",
      );
    }
    return {
      organizationId: current.organizationId,
      membershipId: current.membershipId,
      role: current.role,
      capabilities: capabilities[current.role],
    };
  }

  async optional(actor: TrustedActor | null): Promise<StaffAccess | null> {
    if (!actor) return null;
    try {
      return await this.require(actor, "admin.access");
    } catch (error) {
      if (error instanceof DomainError) return null;
      throw error;
    }
  }

  requireRecent(actor: TrustedActor): void {
    requireRecentActor(actor);
  }

  /** Serialize sensitive writes, then reload access so a competing suspension takes effect. */
  async lock(
    actor: TrustedActor,
    capability: Capability,
    tx: Transaction,
  ): Promise<StaffAccess> {
    const [scope] = await tx
      .select({ id: installation.organizationId })
      .from(installation)
      .where(eq(installation.id, 1));
    if (!scope?.id)
      throw new DomainError(
        "SETUP_REQUIRED",
        "Complete installation first.",
        409,
      );
    await tx
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.id, scope.id))
      .for("update");
    return this.require(actor, capability, tx);
  }
}
