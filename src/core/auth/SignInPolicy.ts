import "server-only";
import { eq } from "drizzle-orm";
import { installation, organization } from "../../../db/schema/club";
import type { Database } from "../../infrastructure/database/client";
import { DomainError } from "../DomainError";

/** The saved sign-in choice applies to every installed-club entry point. */
export class SignInPolicy {
  constructor(private readonly db: Database) {}

  async requiresGoogle(): Promise<boolean> {
    const [current] = await this.db
      .select({ policy: organization.staffAuthPolicy })
      .from(installation)
      .innerJoin(organization, eq(installation.organizationId, organization.id))
      .where(eq(installation.id, 1));
    // Before installation, the nominated owner still uses protected email setup.
    return current?.policy === "google";
  }

  async requireEmailSignIn(): Promise<void> {
    if (await this.requiresGoogle())
      throw new DomainError(
        "GOOGLE_SIGN_IN_REQUIRED",
        "This club uses Google sign-in. Continue with your Google account.",
        403,
      );
  }

  async acceptsSession(method: string): Promise<boolean> {
    if (method === "google") return true;
    return method === "email-otp" && !(await this.requiresGoogle());
  }
}
