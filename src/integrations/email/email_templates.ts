import {
  emailTemplateSchema,
  type EmailTemplate,
  type EmailTemplateKey,
} from "./email_schemas";

export const emailTemplateCatalogue: Record<
  EmailTemplateKey,
  { name: string; purpose: string; defaults: EmailTemplate }
> = {
  verification: {
    name: "Sign-in code",
    purpose:
      "Sent when someone requests a code to sign in. The code and expiry notice are always included.",
    defaults: {
      subject: "Your RotaPress verification code",
      heading: "Welcome to {{club_name}}",
      body: "Use the code below to sign in to your account.",
      buttonLabel: "Open your account",
      accent: "#25636b",
    },
  },
  form_submission: {
    name: "Form response alert",
    purpose:
      "Sent to the staff recipients selected in each form. Answers stay inside the Response center.",
    defaults: {
      subject: "A new RotaPress form submission",
      heading: "You have a new response",
      body: "A new form submission has been saved. Sign in to authorized administration to review it.",
      buttonLabel: "View response",
      accent: "#25636b",
    },
  },
  calendar_update: {
    name: "Calendar update",
    purpose:
      "Sent to subscribers who choose updates. An unsubscribe link is always included.",
    defaults: {
      subject: "Your calendar has updates",
      heading: "Something has changed",
      body: "A calendar you follow has changed. Open your calendar to see the current details.",
      buttonLabel: "Open calendar",
      accent: "#25636b",
    },
  },
  calendar_reminder: {
    name: "Calendar reminder",
    purpose:
      "Sent before an activity, at the time chosen by the subscriber. An unsubscribe link is always included.",
    defaults: {
      subject: "Your calendar reminder",
      heading: "Coming up soon",
      body: "An activity in a calendar you follow starts soon. Open your calendar to see the current details.",
      buttonLabel: "Open calendar",
      accent: "#25636b",
    },
  },
};

export function escapeEmailHtml(text: string) {
  return text.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}
type Content = {
  clubName: string;
  code?: string;
  actionUrl?: string;
  unsubscribeUrl?: string;
};
function safeLink(value: string) {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("INVALID_EMAIL_LINK");
  return escapeEmailHtml(url.href);
}
/** Plain-text edits only. Runtime actions and security/unsubscribe text are not editable. */
export function renderEmail(
  key: EmailTemplateKey,
  input: EmailTemplate,
  content: Content,
) {
  const template = emailTemplateSchema.parse(input);
  const replace = (text: string) =>
    text.replaceAll("{{club_name}}", content.clubName);
  const subject = [...replace(template.subject)]
    .map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? " " : c))
    .join("")
    .slice(0, 200);
  const heading = replace(template.heading);
  const body = replace(template.body);
  const calendar = key.startsWith("calendar_");
  if (key === "verification" && !/^\d{6}$/.test(content.code ?? ""))
    throw new Error("EMAIL_CODE_REQUIRED");
  if (key !== "verification" && !content.actionUrl)
    throw new Error("EMAIL_ACTION_REQUIRED");
  if (calendar && !content.unsubscribeUrl)
    throw new Error("EMAIL_UNSUBSCRIBE_REQUIRED");
  const fixed =
    key === "verification"
      ? `Your RotaPress verification code is ${content.code}. It expires in 5 minutes.\n\nIf you did not request this code, ignore this message.`
      : key === "form_submission"
        ? "Answers are kept in RotaPress and are not included in this email."
        : "Private schedule details are not included in email. Manage or stop these notifications in Calendar → My subscriptions.";
  const text = [
    heading,
    body,
    fixed,
    content.actionUrl,
    calendar
      ? `Stop emails for this calendar:\n${content.unsubscribeUrl}`
      : undefined,
  ]
    .filter(Boolean)
    .join("\n\n");
  const paragraphs = body
    .split(/\n\s*\n/)
    .map(
      (p) =>
        `<p style="line-height:1.7">${escapeEmailHtml(p).replaceAll("\n", "<br>")}</p>`,
    )
    .join("");
  const action =
    key === "verification"
      ? `<p style="font-size:32px;letter-spacing:6px;font-weight:bold">${content.code}</p>`
      : `<p style="margin:28px 0"><a style="display:inline-block;background:${template.accent};color:${buttonForeground(template.accent)};border-radius:8px;padding:14px 22px;text-decoration:none" href="${safeLink(content.actionUrl!)}">${escapeEmailHtml(template.buttonLabel)}</a></p>`;
  const footer = calendar
    ? `<p><a href="${safeLink(content.unsubscribeUrl!)}" style="color:#324c49">Unsubscribe from this calendar's emails</a></p>`
    : "";
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta charset="utf-8">
    <title>${escapeEmailHtml(subject)}</title>
  </head>
  <body style="margin:0;background:#f3f6f5;color:#182e2b;font-family:Arial,sans-serif">
    <div style="max-width:560px;margin:32px auto;padding:28px;background:white;border-radius:12px;border-top:5px solid ${template.accent}">
      <p style="font-size:14px;color:#52645e">${escapeEmailHtml(content.clubName)}</p>
      <h1 style="font-size:26px;line-height:1.3">${escapeEmailHtml(heading)}</h1>
      ${paragraphs}
      ${action}
      <div style="font-size:13px;line-height:1.6;border-top:1px solid #dce4e0;padding-top:16px">
        <p>${escapeEmailHtml(fixed).replaceAll("\n", "<br>")}</p>
        ${footer}
      </div>
    </div>
  </body>
</html>`;
  return { subject, text, html };
}

function buttonForeground(hex: string) {
  const channels = [1, 3, 5].map((position) => {
    const channel = parseInt(hex.slice(position, position + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance =
    channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance > 0.179 ? "#000" : "#fff";
}
