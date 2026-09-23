"use client";

import { useResource } from "@/ui/api";
import { Loading, Notice } from "@/ui/primitives";
import type { PurchaseView } from "../purchase_schemas";
import { PurchaseSummary } from "./purchase-summary";

export function GuestPurchases({
  eventId,
  grantId,
}: {
  eventId: string;
  grantId: string;
}) {
  const endpoint = `/api/guest/${encodeURIComponent(eventId)}/${encodeURIComponent(grantId)}/purchases`;
  const { data, error, refresh } = useResource<PurchaseView>(endpoint);
  return (
    <section className="guest-booking form-stack" aria-label="Your purchases">
      <div>
        <p className="eyebrow">Your purchases</p>
        <h2>Purchase details</h2>
      </div>
      {error && <Notice>{error}</Notice>}
      {!data && !error && <Loading />}
      {data && !error && (
        <>
          <PurchaseSummary view={data} />
          {data.receiptId && (
            <div className="purchase-download">
              <a
                className="button button-outline"
                href={`${endpoint}/receipt`}
                download="purchase-summary.txt"
              >
                Download purchase summary
              </a>
              <p className="field-help">
                A copy of your saved purchase details. This summary is not an
                invoice.
              </p>
            </div>
          )}
        </>
      )}
      <div>
        <button type="button" className="inline-button" onClick={refresh}>
          Reload saved purchase details
        </button>
      </div>
    </section>
  );
}
