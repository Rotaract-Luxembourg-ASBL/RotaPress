export function LumaRegistrationCard({
  url,
  preview = false,
}: {
  url: string;
  preview?: boolean;
}) {
  return (
    <section
      className="panel form-stack forms-public"
      aria-label="Luma registration"
    >
      <h1>Register on Luma</h1>
      <p>
        Registration, tickets and any payments are handled on Luma. Your booking
        will not appear in this website's My registrations.
      </p>
      {preview ? (
        <>
          <p className="field-help">
            Draft preview. This link is not active here.
          </p>
          <p style={{ overflowWrap: "anywhere" }}>{url}</p>
          <button className="button button-accent" disabled>
            Continue to Luma
          </button>
        </>
      ) : (
        <a
          className="button button-accent"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
        >
          Continue to Luma
        </a>
      )}
    </section>
  );
}
