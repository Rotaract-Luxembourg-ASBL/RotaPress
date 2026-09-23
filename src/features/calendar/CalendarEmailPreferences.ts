import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { calendarSubscription } from "../../../db/schema/calendar";
import type { Database } from "@/infrastructure/database/client";
import { DomainError } from "@/core/DomainError";

/** This capability only stops calendar email. It never authenticates or reads private data. */
export class CalendarEmailPreferences {
  constructor(
    private readonly db: Database,
    private readonly secret: string,
    private readonly origin: string,
  ) {}
  private signature(value: string) {
    return createHmac("sha256", this.secret)
      .update("calendar-email-unsubscribe:v1:" + value)
      .digest("base64url");
  }
  link(id: string, version: string) {
    const payload = `${z.uuid().parse(id)}.${z.uuid().parse(version)}`;
    const url = new URL("/email/unsubscribe", this.origin);
    // Fragments never enter server/proxy access logs or the HTTP Referer header.
    url.hash = `${payload}.${this.signature(payload)}`;
    return url.href;
  }
  validate(raw: unknown) {
    const { token } = z.strictObject({ token: z.string().max(150) }).parse(raw);
    const [id, version, signature, extra] = token.split(".");
    const expected = this.signature(`${id}.${version}`);
    if (
      extra !== undefined ||
      !z.uuid().safeParse(id).success ||
      !z.uuid().safeParse(version).success ||
      !/^[\w-]{43}$/.test(signature ?? "") ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      throw new DomainError(
        "UNSUBSCRIBE_LINK_INVALID",
        "This link is invalid. Use the link in your latest calendar email, or manage subscriptions from your account.",
        400,
      );
    }
    return { id, version };
  }
  async unsubscribe(raw: unknown) {
    const { id, version } = this.validate(raw);
    const changed = await this.db
      .update(calendarSubscription)
      .set({ email: false })
      .where(
        and(
          eq(calendarSubscription.id, id),
          eq(calendarSubscription.emailVersion, version),
        ),
      )
      .returning({ id: calendarSubscription.id });
    if (!changed.length)
      throw new DomainError(
        "UNSUBSCRIBE_LINK_EXPIRED",
        "This subscription has changed. Use the link in your latest calendar email, or manage subscriptions from your account.",
        400,
      );
    // Repeated requests remain successful. No email, calendar or account details are returned.
    return { saved: true };
  }
}
