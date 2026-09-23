import type { PurchaseView } from "../purchase_schemas";
import { Notice } from "@/ui/primitives";

const orderStates = {
  free: "Free order",
  uncaptured: "Payment not captured",
  captured: "Payment captured",
  partly_refunded: "Partly refunded",
  refunded: "Refunded",
};

export function money(amount: number, currency: string | null) {
  if (!currency) return `${amount} minor units (currency unavailable)`;
  const formatter = new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  });
  const digits = formatter.resolvedOptions().maximumFractionDigits;
  if (digits === undefined) return `${amount} minor units (${currency})`;
  return formatter.format(amount / 10 ** digits);
}

function Amounts({
  item,
}: {
  item: {
    amount: number;
    discount: number;
    tax: number;
    currency: string | null;
  };
}) {
  return (
    <dl className="purchase-amounts">
      <div>
        <dt>Amount</dt>
        <dd>{money(item.amount, item.currency)}</dd>
      </div>
      <div>
        <dt>Discount</dt>
        <dd>{money(item.discount, item.currency)}</dd>
      </div>
      <div>
        <dt>Tax</dt>
        <dd>{money(item.tax, item.currency)}</dd>
      </div>
    </dl>
  );
}

/** A saved provider observation; no inferred ticket allocation or eligibility. */
export function PurchaseSummary({ view }: { view: PurchaseView }) {
  return (
    <div className="purchase-summary">
      {view.mode === "fixture" && (
        <Notice kind="info">
          Synthetic purchase example from the local provider. No real payment
          was made.
        </Notice>
      )}
      {view.mode === "blocked" && (
        <Notice kind="info">Purchase refresh is currently unavailable.</Notice>
      )}
      {view.status === "never" && (
        <p>
          No purchase details have been saved yet. The event team can refresh
          them from Luma when available.
        </p>
      )}
      {view.status === "running" && (
        <Notice kind="info">
          A purchase refresh is in progress. Any details below are from the last
          completed refresh.
        </Notice>
      )}
      {view.status === "failed" && (
        <Notice>
          The latest purchase refresh failed. Only details that still match this
          booking are shown.
        </Notice>
      )}
      {view.status === "stale" && (
        <Notice kind="info">
          These saved purchase details may be out of date. Contact the event
          team for a refresh.
        </Notice>
      )}
      {view.observedAt && (
        <p className="small muted">
          Details saved from Luma on{" "}
          {new Date(view.observedAt).toLocaleString("en-GB")}
        </p>
      )}
      {view.attemptedAt && view.status !== "observed" && (
        <p className="small muted">
          Latest refresh attempt:{" "}
          {new Date(view.attemptedAt).toLocaleString("en-GB")}
        </p>
      )}
      {view.orders.length > 0 && (
        <section aria-label="Purchase orders">
          <h3>Orders</h3>
          <ul className="purchase-records">
            {view.orders.map((order) => (
              <li key={order.reference}>
                <div className="purchase-record-heading">
                  <strong>{orderStates[order.state]}</strong>
                  <span className="small muted">
                    Reference: {order.reference}
                  </span>
                </div>
                <Amounts item={order} />
                {order.refunded > 0 && (
                  <p>
                    Refunded:{" "}
                    <strong>{money(order.refunded, order.currency)}</strong>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {view.tickets.length > 0 && (
        <section aria-label="Purchased tickets">
          <h3>Tickets</h3>
          <ul className="purchase-records">
            {view.tickets.map((ticket, index) => (
              <li key={index}>
                <div className="purchase-record-heading">
                  <strong>{ticket.name}</strong>
                  <span className="small muted">
                    {ticket.captured
                      ? "Payment captured"
                      : "Payment not captured"}
                  </span>
                </div>
                <Amounts item={ticket} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {view.status === "observed" &&
        !view.orders.length &&
        !view.tickets.length && (
          <p>Luma returned no orders or tickets for this guest.</p>
        )}
      {view.receiptUrl && (
        <div>
          <a
            className="button button-outline"
            href={view.receiptUrl}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
          >
            Open Luma payment history
          </a>
          <p className="field-help">
            Sign in to Luma to view available receipts and payment records.
          </p>
        </div>
      )}
      {(view.orders.length > 0 || view.tickets.length > 0) && (
        <p className="small muted">
          These saved details do not grant additional guest access or prize
          eligibility.
        </p>
      )}
    </div>
  );
}
