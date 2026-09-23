# Email delivery and templates

Open **Administration → Integrations → Email**. This is the single workspace for
delivery connections and email content. Better Auth sign-in codes, form response
alerts and Calendar notifications all use the same application mailer.

## Choose a sender

The local installation starts with **Local capture**, using the existing Mailpit
server. Its messages can be read at `http://127.0.0.1:18025`; they are not delivered
to external mailboxes.

1. Choose **Add connection**, name it and select **Resend** or **SMTP provider**.
2. Enter your sender name and verified sender address. Add an optional reply-to
   address, and the provider credential. SMTP also needs a hostname and username.
3. Save. This does not change the current sender.
4. With external delivery deliberately enabled by the operator, choose **Send
   test**. The test goes only to the signed-in owner's verified account.
5. Check the receiving mailbox, then choose **Use as sender**. A successful test
   records provider acceptance; it is not an inbox-delivery or domain-DNS receipt.

You can save up to ten connections, including multiple SMTP accounts. One sender
is selected for the application. A failed send does not silently move to another
provider. Forms and Calendar retain their existing bounded outbox retries and
delivery state. SMTP cannot promise exactly-once delivery after an interruption.
Resend uses a stable idempotency key derived from the message ID; its provider
window is finite. Editing a template or sender during an uncertain retry can
cause Resend to reject the changed payload for that key rather than send it twice.

Changing connections requires a current owner session and recent authentication,
because this connection delivers sign-in codes. Routine template edits do not
require repeated sign-in. Credentials are encrypted, never returned to the browser
and never recorded in audit metadata. An edit to a credential/account resets its
test state. Choose another sender before editing or deleting the selected one.

## Design emails

The **Templates** tab includes:

| Email | Recipient | Protected content |
| --- | --- | --- |
| Sign-in code | Person requesting Better Auth sign-in | Code, five-minute expiry and ignore-if-unrequested notice |
| Form response alert | Staff recipients configured in the form | Link to authorized review; no submitted answers |
| Calendar update | Subscribers choosing updates | Current calendar link, privacy notice and unsubscribe link |
| Calendar reminder | Subscribers choosing a reminder time | Current calendar link, privacy notice and unsubscribe link |

Edit the subject, heading, message, button text and accent color. The available
placeholder is `{{club_name}}`. The preview uses sample content and the same
renderer as delivery. Plain-text email is included alongside the HTML version.
All entered copy is escaped; templates cannot run scripts, load files, render
arbitrary HTML or inject headers. Private answers and schedule details are not
available as template variables.

**Save draft** keeps sending the current published/default template. **Publish
template** changes future delivery. **Restore default in draft** allows reviewing
the supplied copy before saving and publishing it. Concurrent edits are rejected
with a reload instruction. There is no bulk campaign composer in this slice.

## Customize a calendar or form

Open **Calendar → Emails**, choose a calendar, then choose its update or reminder
email. Open a form and choose **Emails** to customize its response alert. Both
editors offer the same content controls, preview, save and publish workflow.

Each starts with the shared template. Choose **Customize for this calendar** or
**Customize for this form** to make a separate draft. Saving it does not change
sent messages. Publishing applies only to that calendar and email type, or that
form. Another calendar or form keeps its own settings.

Delivery uses the published customization first, then the shared published
template, then the built-in default. Changes to a shared template automatically
reach calendars and forms that still use it. **Use shared template** resumes that
inheritance immediately and retains your saved custom draft for later use.
Archived calendars and forms are read-only until restored.

Calendar management permission controls calendar templates. Form templates use
the form's existing settings permission, including event managers being limited
to their own event forms. These permissions never grant access to sender
credentials or the shared sign-in email. Form response alerts go to the staff
recipients set in that form; automatic replies to people submitting a form are
not included in this notification type.

## Stop calendar emails

Every Calendar update/reminder includes **Unsubscribe from this calendar's
emails**. Open it and confirm to stop emails without signing in. This leaves other
calendars, website notices, membership and sign-in codes unchanged. The account's
**Calendar → My subscriptions** panel can stop the entire subscription or turn
emails back on. Form alerts are operational staff notifications; their recipients
are managed in the form's notification settings.

Opening the link is read-only, including when an email scanner visits it. A
same-origin POST validates a signed, purpose-specific capability for one
subscription before changing its email preference. It is not an authentication
token and cannot read private data. The token travels in the URL fragment, then
the request body; it is removed from browser history and never placed in HTTP
access-log query strings. Resubscribing invalidates the old email link. A link
can still stop email after a calendar is unpublished or disabled.

This is a confirmation link, not a claim of RFC 8058 mailbox one-click support.
The link requires JavaScript. Reloading after the token has been removed requires
opening the email link again. A message already handed to a provider cannot be
recalled. Rotating the application secret invalidates older unsubscribe links;
signed-in preference management remains available.

## Operator controls and local boundaries

`EMAIL_REMOTE_DELIVERY_ENABLED=false` is the default. Saving a connection needs
the existing `INTEGRATION_ENCRYPTION_KEY`, but does not contact the provider.
Only enable remote sending after authorization for the actual provider, sender
and recipient. Restart both the application and worker after changing the flag.
The local baseline remains SMTP/Mailpit; this implementation does not authorize
an online deployment or real participant mail.

SMTP accepts public DNS hostnames on 465 (TLS) or 587 (required STARTTLS). It checks
and pins public IPv4 resolution, verifies the hostname certificate, requires TLS
1.2 or newer and disables file/URL access in Nodemailer. Private hosts, arbitrary
ports, plaintext remote SMTP and TLS bypasses are unavailable. IPv6-only SMTP
servers are not supported. Resend uses only its fixed HTTPS sending endpoint,
rejects redirects and bounds request time. Raw provider errors are discarded.

Keep the encryption key in the installation backup. A selected provider failure
also affects email sign-in. Retain an authorized owner session while changing
delivery, and use it to return to local capture if needed. Operator recovery and
external sender/domain verification must be exercised before an online release;
See [release limitations](../development/roadmap.md).

Reference contracts: [Resend sending API](https://resend.com/docs/api-reference/emails/send-email),
[Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys) and
[Nodemailer SMTP/TLS](https://nodemailer.com/smtp). Local checks use Mailpit or
injected transports; they do not prove a live Resend or external SMTP connection.

## Contributor contract

`ApplicationMailer` owns notification purposes and template rendering.
`EmailTemplateReader` resolves published resource overrides and shared defaults.
`ScopedEmailTemplateService` applies the owning feature's current permissions;
composite foreign keys bind overrides to the same organization's calendar/form.
`EmailDelivery` resolves the selected connection and decrypts its credential.
`EmailTransport` implements the explicit SMTP/Resend providers. Features pass
only the recipient and the permitted action context; they do not instantiate
their own SMTP clients. New providers implement the narrow `MailTransport`
contract and join the reviewed registry/configuration UI. Add them for a concrete
delivery need, with fixed egress, secret-safe errors and focused acceptance.

Do not add uploaded executable plugins, a service locator, a second auth system,
silent failover, or provider-side contact-list synchronization as part of this
contract. Future routing per email purpose should be an explicit product change
that preserves consent and the existing outbox ownership.
