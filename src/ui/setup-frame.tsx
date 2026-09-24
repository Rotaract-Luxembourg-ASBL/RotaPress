import type { ReactNode } from "react";
import Image from "next/image";
import { Brand } from "./primitives";
import { Icon } from "./icon";

const steps = [
  {
    title: "Connect email",
    detail: "Your server’s sender is ready before sign-in.",
  },
  { title: "Verify your email", detail: "A secure start for the first owner." },
  {
    title: "Introduce your club",
    detail: "A name, a purpose and a little personality.",
  },
  {
    title: "Make it yours",
    detail: "Open your workspace and build your website.",
  },
];

export function SetupFrame({
  step,
  children,
}: {
  step: 0 | 1 | 2 | 3;
  children: ReactNode;
}) {
  return (
    <div className="setup-experience">
      <header className="setup-header">
        <Brand />
        <span className="setup-header-label">First-time setup</span>
      </header>
      <main id="main-content" className="setup-layout">
        <aside className="setup-intro" aria-label="Getting started">
          <p className="setup-eyebrow">Community. Fellowship. Service.</p>
          <h2>
            Bring your club
            <br /> together.
          </h2>
          <p className="setup-intro-copy">
            One home for your website, your members and the things you do
            together.
          </p>
          <ol className="setup-progress" aria-label="Setup progress">
            {steps.map((item, index) => (
              <li
                key={item.title}
                aria-current={index === step ? "step" : undefined}
                data-complete={index < step || undefined}
              >
                <span className="setup-step-number" aria-hidden="true">
                  {index < step ? <Icon name="check" /> : `0${index + 1}`}
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                {index < step && <span className="sr-only">Completed</span>}
              </li>
            ))}
          </ol>
          <div className="setup-intro-footer">
            <Image
              src="/brand/rotapress-icon.svg"
              width={46}
              height={46}
              alt=""
            />
            <p>
              Built for Rotary &amp; Rotaract communities.
              <br />
              <strong>Open source. Yours to shape.</strong>
            </p>
          </div>
        </aside>
        <div className="setup-content">{children}</div>
      </main>
      <footer className="setup-footer">
        <span>RotaPress · Made for communities.</span>
        <a
          href="https://github.com/Rotaract-Luxembourg-ASBL/RotaPress/blob/main/docs/guides/email-setup.md"
          target="_blank"
          rel="noreferrer"
        >
          Setup guide <Icon name="external" width={14} height={14} />
        </a>
      </footer>
    </div>
  );
}

export function SetupHelp() {
  return (
    <details className="setup-help">
      <summary>About owner access</summary>
      <div>
        <p>
          Use the owner email nominated by the person who configured this
          server. Your verification code goes to that inbox and expires after
          five minutes.
        </p>
        <p>
          Open the private setup link created by the installer, or enter the
          installation claim supplied by your administrator. Email verification
          alone cannot claim this installation.
        </p>
        <p>
          If a code cannot be delivered, check the configured sender. If your
          setup link expires, the person running the installer can renew it.
        </p>
      </div>
    </details>
  );
}

export function SetupEmailRequired() {
  return (
    <section className="setup-card">
      <span className="setup-card-icon">
        <Icon name="mail" width={26} height={26} />
      </span>
      <p className="setup-eyebrow">Step 01 · Email delivery</p>
      <h1>Connect email before you begin.</h1>
      <p className="setup-description">
        RotaPress needs a sender to deliver your owner verification code. The
        server administrator must configure Resend or SMTP before you can sign
        in.
      </p>
      <a
        className="button button-accent button-full"
        href="https://github.com/Rotaract-Luxembourg-ASBL/RotaPress/blob/main/docs/guides/email-setup.md"
        target="_blank"
        rel="noreferrer"
      >
        Open email setup guide <Icon name="external" />
      </a>
      <div className="setup-checklist">
        <h2>For the server administrator</h2>
        <p>
          Set the sender and its credentials in the server environment, enable
          delivery, then restart RotaPress. The credentials stay on the server.
        </p>
        <p>
          Nominate the owner’s email and give them the private installation
          claim. After setup, the owner can manage delivery in Email settings.
        </p>
      </div>
      <a className="text-link setup-back" href="/setup">
        Check again
      </a>
    </section>
  );
}
