import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { guestAccess } from "../../db/schema/guest-access";
import { clubEvent } from "../../db/schema/events";
import { lumaGuestProjection } from "../../db/schema/luma-sync";
import { lumaReconciliationJob } from "../../db/schema/luma-jobs";
import { lumaWebhookReceipt } from "../../db/schema/luma-webhooks";
import { EventPackageService } from "../../src/features/events/EventPackageService";
import { eventFields } from "../../src/features/events/event_schemas";
import { GuestAccessService } from "../../src/features/guests/GuestAccessService";
import { LumaGuestAccessSource } from "../../src/integrations/luma/LumaGuestAccessSource";
import { LumaWebhookService } from "../../src/integrations/luma/LumaWebhookService";
import { CredentialCipher } from "../../src/integrations/luma/CredentialCipher";
import {
  type Context,
  confirm,
  destination,
  fixture,
  guest,
  setup,
} from "./luma-sync-fixture";

const secondDestination = "https://luma.com/synthetic-second-source";
const providerA = "evt-sync";
const providerB = "evt-sync-second";

export function lumaSourceChecks(get: () => Context) {
  async function ready() {
    const provider = await fixture();
    try {
      const s = await setup(get(), provider.client);
      // The shared legacy fixture includes creation-only managerUserId. Store
      // the actual published field contract before testing private guest grants.
      await s.db
        .update(clubEvent)
        .set({
          published: eventFields(await s.events.detail(s.manager, s.event.id)),
        })
        .where(eq(clubEvent.id, s.event.id));
      await s.link();
      const packages = new EventPackageService(
        s.db,
        get().authorization,
        s.events,
        s.modules,
        s.registrations,
        s.links,
      );
      const legacy = await s.api.workspace(s.manager, s.event.id);
      const sources = (
        await packages.source(s.manager, s.event.id, {
          label: "Second synthetic source",
          url: secondDestination,
        })
      ).sources;
      const sourceA = sources.find((source) => source.id === legacy.sourceId)!;
      const sourceB = sources.find(
        (source) => source.url === secondDestination,
      )!;
      provider.source(providerB, secondDestination);
      await s.link(s.manager, providerB, sourceB.id);
      const records = () =>
        s.db.select().from(lumaGuestProjection).orderBy(lumaGuestProjection.id);
      return { ...s, provider, packages, sourceA, sourceB, records };
    } catch (error) {
      await provider.close();
      throw error;
    }
  }

  it("C08 sources: isolates equal provider guest IDs and preserves UUIDs and grants through replay, missing records and failed pages", async () => {
    const s = await ready();
    try {
      const first = await s.reconcile(randomUUID(), s.manager, s.sourceA.id);
      await s.reconcile(randomUUID(), s.manager, s.sourceB.id);
      const original = await s.records();
      const replayCalls = s.provider.calls();
      await expect(
        s.sync.reconcile(s.manager, s.event.id, {
          ...first.input,
          sourceId: s.sourceB.id,
        }),
      ).rejects.toMatchObject({ status: 409 });
      expect(s.provider.calls()).toBe(replayCalls);
      expect(original).toHaveLength(4);
      const firstGuests = original.filter(
        (guest) => guest.sourceId === s.sourceA.id,
      );
      const secondGuests = original.filter(
        (guest) => guest.sourceId === s.sourceB.id,
      );
      expect(firstGuests).toHaveLength(2);
      expect(secondGuests).toHaveLength(2);
      const duplicateId = original.filter(
        (guest) => guest.providerGuestId === "gst-one",
      );
      expect(new Set(duplicateId.map((guest) => guest.id)).size).toBe(2);
      expect((await s.api.workspace(s.manager, s.event.id)).sourceId).toBe(
        s.sourceA.id,
      );
      expect(
        (await s.api.workspace(s.manager, s.event.id, s.sourceB.id)).guests
          .map((guest) => guest.id)
          .sort(),
      ).toEqual(secondGuests.map((guest) => guest.id).sort());
      await expect(
        s.api.workspace(s.manager, s.event.id, randomUUID()),
      ).rejects.toThrow();
      await s.modules.change(s.manager, {
        id: s.event.id,
        ...confirm((await s.events.detail(s.manager, s.event.id)).version),
        key: "portal",
        operation: "enable",
        suspendDependents: false,
      });
      const guests = new GuestAccessService(
        s.db,
        s.events,
        s.modules,
        s.registrations,
        new LumaGuestAccessSource(),
      );
      const grant = await guests.grant(s.manager, s.event.id, {
        source: "luma",
        sourceId: firstGuests.find(
          (guest) =>
            guest.providerGuestId === "gst-one" &&
            guest.approvalStatus === "approved",
        )!.id,
        confirmed: true,
      });
      const retained = (
        await s.db
          .select()
          .from(guestAccess)
          .where(eq(guestAccess.id, grant.id))
      )[0];
      const calls = s.provider.calls();
      await s.sync.reconcile(s.manager, s.event.id, first.input);
      expect(s.provider.calls()).toBe(calls);
      expect(await s.records()).toEqual(original);
      await s.elapsed(s.sourceA.id);
      await s.reconcile(randomUUID(), s.manager, s.sourceA.id);
      expect((await s.records()).map((guest) => guest.id)).toEqual(
        original.map((guest) => guest.id),
      );
      s.provider.mode("missing", providerA);
      await s.elapsed(s.sourceA.id);
      await s.reconcile(randomUUID(), s.manager, s.sourceA.id);
      const missing = await s.records();
      expect(
        missing.filter((guest) => guest.sourceId === s.sourceB.id),
      ).toEqual(secondGuests);
      expect(
        missing.find(
          (guest) =>
            guest.sourceId === s.sourceA.id &&
            guest.providerGuestId === "gst-two",
        )?.present,
      ).toBe(false);
      expect(
        (
          await s.db
            .select()
            .from(guestAccess)
            .where(eq(guestAccess.id, grant.id))
        )[0],
      ).toEqual(retained);
      s.provider.mode("failure", providerA);
      await s.elapsed(s.sourceA.id);
      expect(
        (await s.reconcile(randomUUID(), s.manager, s.sourceA.id)).runs[0]
          .status,
      ).toBe("failed");
      expect(await s.records()).toEqual(missing);
      await s.elapsed(s.sourceA.id);
      let release: (() => void) | undefined;
      s.provider.hold((response) => {
        release = () =>
          response.end(
            JSON.stringify({
              entries: [guest("gst-must-not-commit")],
              has_more: false,
            }),
          );
      });
      const importing = s.reconcile(randomUUID(), s.manager, s.sourceA.id);
      await expect.poll(() => Boolean(release)).toBe(true);
      let source = s.sourceA;
      for (const enabled of [false, true]) {
        source = (
          await s.packages.source(s.manager, s.event.id, {
            id: source.id,
            ...confirm(source.version),
            label: source.label,
            enabled,
          })
        ).sources.find((item) => item.id === source.id)!;
      }
      release!();
      expect((await importing).runs[0].status).toBe("failed");
      expect(await s.records()).toEqual(missing);
    } finally {
      await s.provider.close();
    }
  });

  it("C08 sources: cancels a stale source job after disable and reenable while another source executes once", async () => {
    const s = await ready();
    try {
      const offer = (
        await s.packages.save(s.manager, s.event.id, {
          expectedVersion: 0,
          sourceId: s.sourceB.id,
          draft: {
            title: "Second source offer",
            description: "Synthetic secondary checkout",
            priceMinor: 1000,
            currency: "EUR",
            showPrice: true,
            checkoutEnabled: true,
            position: 0,
          },
        })
      ).packages[0];
      await s.packages.publication(s.manager, s.event.id, offer.id, {
        ...confirm(offer.version),
        operation: "publish",
        expectedSourceVersion: s.sourceB.version,
      });
      expect(await s.links.publicLink(s.manager, s.event.id)).toBe(destination);
      const firstRequestId = randomUUID();
      for (const source of [s.sourceA, s.sourceB]) {
        const state = await s.api.workspace(s.manager, s.event.id, source.id);
        await s.jobs.enqueue(s.manager, s.event.id, {
          ...confirm(state.version),
          sourceId: source.id,
          requestId: source.id === s.sourceA.id ? firstRequestId : randomUUID(),
        });
      }
      expect(await s.db.select().from(lumaReconciliationJob)).toHaveLength(2);
      const other = await s.api.workspace(s.manager, s.event.id, s.sourceB.id);
      await expect(
        s.jobs.enqueue(s.manager, s.event.id, {
          ...confirm(other.version),
          sourceId: s.sourceB.id,
          requestId: firstRequestId,
        }),
      ).rejects.toMatchObject({ status: 409 });
      expect(await s.db.select().from(lumaReconciliationJob)).toHaveLength(2);
      const before = s.provider.calls(providerA);
      let source = s.sourceA;
      for (const enabled of [false, true]) {
        source = (
          await s.packages.source(s.manager, s.event.id, {
            id: source.id,
            ...confirm(source.version),
            label: source.label,
            enabled,
          })
        ).sources.find((item) => item.id === source.id)!;
        expect(await s.links.publicLink(s.manager, s.event.id)).toBe(
          enabled ? destination : null,
        );
        expect(
          (await s.packages.published(s.manager, s.event.id))[0].checkoutUrl,
        ).toBe(secondDestination);
      }
      const result = await s.runner().runBatch();
      expect(result).toMatchObject({ cancelled: 1, succeeded: 1 });
      expect(s.provider.calls(providerA)).toBe(before);
      expect(
        (await s.records()).every((guest) => guest.sourceId === s.sourceB.id),
      ).toBe(true);
      expect(await s.records()).toHaveLength(2);
      expect(
        (await s.jobs.history(s.manager, s.event.id, s.sourceA.id))[0].status,
      ).toBe("cancelled");
      expect(
        (await s.jobs.history(s.manager, s.event.id, s.sourceB.id))[0].status,
      ).toBe("succeeded");
      expect((await s.runner().runBatch()).processed).toBe(0);
      expect(
        (await s.api.workspace(s.manager, s.event.id, s.sourceA.id)).guests,
      ).toEqual([]);
      const link = await s.links.workspace(s.manager, s.event.id);
      await s.links.publication(s.manager, s.event.id, {
        ...confirm(link.version),
        expectedRegistrationVersion: link.registrationVersion,
        operation: "unpublish",
      });
      expect(await s.links.publicLink(s.manager, s.event.id)).toBeNull();
      expect(
        (await s.packages.published(s.manager, s.event.id))[0].checkoutUrl,
      ).toBeNull();
    } finally {
      await s.provider.close();
    }
  });

  it("C08 sources: routes signed duplicate-safe notifications to their source without accepting guest or payment authority", async () => {
    const s = await ready();
    try {
      const webhook = new LumaWebhookService(
        s.db,
        get().authorization,
        s.availability,
        new CredentialCipher(randomBytes(32).toString("hex")),
        "http://127.0.0.1:4100",
      );
      const generated = await webhook.configure(
        s.owner,
        "generate",
        confirm(0),
      );
      const secret = `whsec_${randomBytes(32).toString("base64")}`;
      const state = await webhook.configure(s.owner, "save", {
        ...confirm(generated.version),
        secret,
        eventTypes: ["guest.updated"],
      });
      const endpoint = new URL(state.callbackUrl!).pathname.split("/").at(-1)!;
      async function send(providerEventId: string) {
        const body = Buffer.from(
          JSON.stringify({
            type: "guest.updated",
            data: {
              event: { id: providerEventId },
              user_email: "synthetic-private@example.test",
              payment: { eligible: true },
            },
          }),
        );
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.`).update(body).digest("hex")}`;
        await webhook.receive(endpoint, signature, body);
      }
      await send(providerA);
      await send(providerA);
      await send(providerB);
      await send("evt-unmapped");
      const receipts = (await webhook.workspace(s.owner)).receipts;
      expect(receipts).toHaveLength(3);
      expect(
        receipts
          .filter((receipt) => receipt.eventId === s.event.id)
          .map((receipt) => receipt.sourceId)
          .sort(),
      ).toEqual([s.sourceA.id, s.sourceB.id].sort());
      expect(receipts.filter((receipt) => receipt.eventId === null)).toEqual([
        expect.objectContaining({ sourceId: null }),
      ]);
      const serialized = JSON.stringify({
        receipts,
        stored: await s.db.select().from(lumaWebhookReceipt),
      });
      for (const excluded of [
        "synthetic-private",
        "payment",
        "eligible",
        secret,
      ])
        expect(serialized.includes(excluded)).toBe(false);
      expect(await s.records()).toHaveLength(0);
      expect(await s.db.select().from(lumaReconciliationJob)).toHaveLength(0);
      const receipt = receipts.find((item) => item.sourceId === s.sourceB.id)!;
      const reviewed = await s.api.workspace(
        s.manager,
        receipt.eventId!,
        receipt.sourceId!,
      );
      await s.jobs.enqueue(s.manager, receipt.eventId!, {
        ...confirm(reviewed.version),
        sourceId: receipt.sourceId!,
        requestId: randomUUID(),
      });
      expect((await s.runner().runBatch()).succeeded).toBe(1);
      const recovered = await s.records();
      expect(recovered).toHaveLength(2);
      expect(recovered.every((guest) => guest.sourceId === s.sourceB.id)).toBe(
        true,
      );
      expect(
        (await s.api.workspace(s.manager, s.event.id, s.sourceA.id)).guests,
      ).toEqual([]);
    } finally {
      await s.provider.close();
    }
  });
}
