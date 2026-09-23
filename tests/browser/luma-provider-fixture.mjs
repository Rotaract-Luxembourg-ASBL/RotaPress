import { createServer } from "node:http";

/** Synthetic transport for the isolated browser server, never the developer app. */
export async function startLumaFixture() {
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (request.method !== "GET") {
      response.writeHead(404).end();
      return;
    }
    if (
      !/^synthetic-[a-f0-9]{48}$/.test(request.headers["x-luma-api-key"] ?? "")
    ) {
      response.writeHead(401).end();
      return;
    }
    response.setHeader("content-type", "application/json");
    if (url.pathname === "/v1/calendars/get") {
      response.end(
        JSON.stringify({
          id: "cal-synthetic-browser",
          name: "Synthetic browser calendar",
        }),
      );
      return;
    }
    const providerEventId = url.searchParams.get("event_id");
    const alternative = providerEventId === "evt-synthetic-alternative";
    if (providerEventId !== "evt-synthetic-browser" && !alternative) {
      response.writeHead(404).end();
      return;
    }
    if (url.pathname === "/v1/events/get") {
      response.end(
        JSON.stringify({
          id: providerEventId,
          calendar_id: "cal-synthetic-browser",
          access: "manage",
          url: alternative
            ? "https://luma.com/rotapress-synthetic-package-alternative"
            : "https://luma.com/rotapress-synthetic-browser-event",
        }),
      );
      return;
    }
    if (url.pathname === "/v1/events/guests/get") {
      const guestId = url.searchParams.get("id");
      if (
        !["gst-one", "gst-two"].includes(guestId) ||
        (alternative && guestId !== "gst-one")
      ) {
        response.writeHead(404).end();
        return;
      }
      response.end(
        JSON.stringify({
          id: guestId,
          user_id: `usr-${alternative ? "alternative" : guestId}`,
          user_email: alternative
            ? "synthetic-alternative@example.test"
            : guestId === "gst-one"
              ? "synthetic-one@example.test"
              : "synthetic-two@example.test",
          event_ticket_orders: [
            {
              id: `order-${alternative ? "alternative" : guestId}`,
              amount: 2500,
              amount_discount: 0,
              amount_tax: 0,
              currency: "eur",
              is_captured: true,
              amount_refunded: 0,
              coupon_info: null,
            },
          ],
          event_tickets: [
            {
              id: `ticket-${alternative ? "alternative" : guestId}`,
              name: "Synthetic community admission",
              amount: 2500,
              amount_discount: 0,
              amount_tax: 0,
              currency: "eur",
              is_captured: true,
              checked_in_at: null,
              event_ticket_type_id: "type-synthetic",
            },
          ],
        }),
      );
      return;
    }
    if (url.pathname === "/v1/events/guests/list") {
      const next = url.searchParams.has("pagination_cursor");
      response.end(
        JSON.stringify({
          entries: [
            {
              id: next ? "gst-two" : "gst-one",
              user_name: alternative
                ? "Synthetic alternative guest"
                : next
                  ? "Synthetic second guest"
                  : "Synthetic first guest",
              user_email: alternative
                ? "synthetic-alternative@example.test"
                : next
                  ? "synthetic-two@example.test"
                  : "synthetic-one@example.test",
              approval_status: "approved",
              event_tickets: [],
            },
          ],
          has_more: !alternative && !next,
          ...(alternative || next ? {} : { next_cursor: "page-two" }),
        }),
      );
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Synthetic provider did not bind.");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => {
      server.closeAllConnections();
      server.close();
    },
  };
}
