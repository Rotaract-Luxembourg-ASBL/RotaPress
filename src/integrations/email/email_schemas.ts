import { z } from "zod";

const line = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (text) =>
        [...text].every(
          (c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127,
        ),
      "Use a single line of text.",
    );
export const templateKeys = [
  "verification",
  "form_submission",
  "calendar_update",
  "calendar_reminder",
] as const;
export const templateKeySchema = z.enum(templateKeys);
export type EmailTemplateKey = z.infer<typeof templateKeySchema>;
const copy = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (text) => !/[{}]/.test(text.replaceAll("{{club_name}}", "")),
      "The available placeholder is {{club_name}}.",
    );
export const emailTemplateSchema = z.strictObject({
  subject: line(160).and(copy(160)),
  heading: line(160).and(copy(160)),
  body: copy(3000),
  buttonLabel: line(60),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i),
});
export type EmailTemplate = z.infer<typeof emailTemplateSchema>;
export const smtpSettingsSchema = z.strictObject({
  host: z
    .string()
    .trim()
    .toLowerCase()
    .max(253)
    .regex(/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/)
    .refine(
      (host) =>
        host.includes(".") &&
        !/^\d+(\.\d+){3}$/.test(host) &&
        !/(^|\.)(local|localhost|internal|test|invalid|example)$/.test(host),
      "Use your provider's public SMTP hostname.",
    ),
  port: z.union([z.literal(465), z.literal(587)]),
  username: line(200),
});
export type SmtpSettings = z.infer<typeof smtpSettingsSchema>;
export const connectionSaveSchema = z
  .strictObject({
    id: z.uuid().optional(),
    expectedVersion: z.number().int().min(0),
    name: line(80),
    provider: z.enum(["smtp", "resend"]),
    senderName: line(100),
    senderEmail: z.email().max(254),
    replyTo: z.union([z.email().max(254), z.literal("")]),
    smtp: smtpSettingsSchema.nullable(),
    secret: z
      .string()
      .min(1)
      .max(200)
      .refine(
        (text) =>
          [...text].every(
            (c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127,
          ) && new TextEncoder().encode(text).length <= 256,
        "Use a credential up to 200 characters without control characters.",
      )
      .optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.provider === "smtp") !== Boolean(v.smtp))
      ctx.addIssue({
        code: "custom",
        path: ["smtp"],
        message: "Enter SMTP settings only for an SMTP connection.",
      });
    if (
      v.provider === "resend" &&
      v.secret &&
      !/^re_[a-zA-Z0-9_-]{12,200}$/.test(v.secret)
    )
      ctx.addIssue({
        code: "custom",
        path: ["secret"],
        message: "Enter a Resend API key beginning with re_.",
      });
  });
export type ConnectionInput = z.infer<typeof connectionSaveSchema>;
export const connectionActionSchema = z.strictObject({
  id: z.uuid().nullable(),
  expectedVersion: z.number().int().min(0),
});
export const templateSaveSchema = z.strictObject({
  key: templateKeySchema,
  expectedVersion: z.number().int().min(0),
  draft: emailTemplateSchema,
});
export const templatePublishSchema = templateSaveSchema.omit({ draft: true });
export type EmailConnectionView = Omit<
  ConnectionInput,
  "secret" | "id" | "expectedVersion"
> & {
  id: string;
  version: number;
  isDefault: boolean;
  hasSecret: boolean;
  verifiedAt: string | null;
};
export type EmailTemplateView = {
  key: EmailTemplateKey;
  version: number;
  draft: EmailTemplate;
  published: EmailTemplate | null;
};
export type EmailWorkspace = {
  connections: EmailConnectionView[];
  templates: EmailTemplateView[];
  canManageConnections: boolean;
  encryptionReady: boolean;
  remoteEnabled: boolean;
  clubName: string;
  localDefault: boolean;
};

export const emailTemplateTargetSchema = z.strictObject({
  kind: z.enum(["calendar", "form"]),
  id: z.uuid(),
});
export type EmailTemplateTarget = z.infer<typeof emailTemplateTargetSchema>;
export const scopedEmailActionSchema = z.discriminatedUnion("operation", [
  templateSaveSchema.extend({
    operation: z.literal("save"),
    target: emailTemplateTargetSchema,
  }),
  templatePublishSchema.extend({
    operation: z.enum(["publish", "useDefault"]),
    target: emailTemplateTargetSchema,
  }),
]);
export type ScopedEmailWorkspace = {
  target: EmailTemplateTarget;
  name: string;
  clubName: string;
  readOnly: boolean;
  templates: (EmailTemplateView & { fallback: EmailTemplate })[];
};
