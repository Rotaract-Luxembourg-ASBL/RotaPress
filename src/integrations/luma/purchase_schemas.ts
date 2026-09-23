import { z } from "zod";

// Fiat members of Luma's documented Currency enum. Crypto units are unsupported.
const fiatCurrencies = new Set(
  `aed afn all amd ang aoa ars aud awg azn bam bbd bdt bgn bhd bif bmd bnd bob
   brl bsd bwp byn bzd cad cdf chf clp cny cop crc cve czk djf dkk dop dzd
   egp etb eur fjd fkp gbp gel ghs gip gmd gnf gtq gyd hkd hnl htg huf idr ils
   inr isk jmd jod jpy kes kgs khr kmf krw kwd kyd kzt lak lbp lkr lrd lsl
   mad mdl mga mkd mmk mnt mop mur mvr mwk mxn myr mzn nad ngn nio nok npr
   nzd omr pab pen pgk php pkr pln pyg qar ron rsd rub rwf sar sbd scr sek sgd
   shp sle sos srd std szl thb tjs tnd top try ttd twd tzs uah ugx usd uyu uzs
   vnd vuv wst xaf xcd xof xpf yer zar zmw`
    .split(/\s+/)
    .map((code) => code.toUpperCase()),
);
const identity = z.string().regex(/^[A-Za-z0-9_-]{1,120}$/);
const minorUnits = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const currency = z
  .string()
  .regex(/^[A-Z]{3}$/)
  .refine((code) => fiatCurrencies.has(code), "Unsupported currency.")
  .nullable();
const money = {
  amount: minorUnits,
  discount: minorUnits,
  tax: minorUnits,
  currency,
  captured: z.boolean(),
};
const order = z
  .object({ ...money, providerOrderId: identity, refunded: minorUnits })
  .refine((value) => value.currency !== null || value.amount === 0, {
    path: ["currency"],
    message: "A nonzero amount requires a supported currency.",
  })
  .refine((value) => value.refunded <= value.amount, {
    path: ["refunded"],
    message: "Refunded amount exceeds the order amount.",
  });
const ticket = z
  .object({
    ...money,
    providerTicketId: identity,
    name: z.string().min(1).max(200),
  })
  .refine((value) => value.currency !== null || value.amount === 0, {
    path: ["currency"],
    message: "A nonzero amount requires a supported currency.",
  });

/** Narrow stored projection; no package relation, receipt URL or eligibility is inferred. */
export const importedPurchaseDetailsSchema = z
  .object({
    providerGuestId: identity,
    providerUserId: identity,
    email: z
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
    orders: z.array(order).max(100),
    tickets: z.array(ticket).max(200),
  })
  .superRefine((value, context) => {
    if (
      new Set(value.orders.map((item) => item.providerOrderId)).size !==
      value.orders.length
    )
      context.addIssue({
        code: "custom",
        path: ["orders"],
        message: "Duplicate provider order identity.",
      });
    if (
      new Set(value.tickets.map((item) => item.providerTicketId)).size !==
      value.tickets.length
    )
      context.addIssue({
        code: "custom",
        path: ["tickets"],
        message: "Duplicate provider ticket identity.",
      });
  });

const providerMoney = {
  id: identity,
  amount: minorUnits,
  amount_discount: minorUnits,
  amount_tax: minorUnits,
  currency: z
    .string()
    .regex(/^[a-z]{3}$/)
    .transform((value) => value.toUpperCase())
    .nullable(),
  is_captured: z.boolean(),
};

/** Documented GET /v1/events/guests/get fields; unknown private fields are discarded. */
export const providerPurchaseDetailsSchema = z
  .object({
    id: identity,
    user_id: identity,
    user_email: z.email().max(254),
    event_ticket_orders: z
      .array(z.object({ ...providerMoney, amount_refunded: minorUnits }))
      .max(100),
    event_tickets: z
      .array(z.object({ ...providerMoney, name: z.string().min(1).max(200) }))
      .max(200),
  })
  .transform((value) => ({
    providerGuestId: value.id,
    providerUserId: value.user_id,
    email: value.user_email,
    orders: value.event_ticket_orders.map((item) => ({
      providerOrderId: item.id,
      amount: item.amount,
      discount: item.amount_discount,
      tax: item.amount_tax,
      currency: item.currency,
      captured: item.is_captured,
      refunded: item.amount_refunded,
    })),
    tickets: value.event_tickets.map((item) => ({
      providerTicketId: item.id,
      name: item.name,
      amount: item.amount,
      discount: item.amount_discount,
      tax: item.amount_tax,
      currency: item.currency,
      captured: item.is_captured,
    })),
  }))
  .pipe(importedPurchaseDetailsSchema);

export type ImportedPurchaseDetails = z.output<
  typeof importedPurchaseDetailsSchema
>;
