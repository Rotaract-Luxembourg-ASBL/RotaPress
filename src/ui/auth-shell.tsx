import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "./primitives";

/** Shared presentation for account access and a reviewed AI connection. */
export function AuthShell({
  brand,
  context,
  introductionHeading,
  description,
  identity,
  children,
  footer,
  mode = "account",
}: {
  brand?: ReactNode;
  context: string;
  introductionHeading: string;
  description?: ReactNode;
  identity?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  mode?: "account" | "connection";
}) {
  return (
    <main id="main-content" className={`auth-shell auth-shell-${mode}`}>
      <div className="auth-shell-frame">
        <div className="auth-shell-context">
          <div className="auth-shell-brand">{brand ?? <Brand />}</div>
          <div className="auth-shell-context-copy">
            <p className="auth-shell-eyebrow">{context}</p>
            <p className="auth-shell-introduction">{introductionHeading}</p>
            {description && (
              <div className="auth-shell-description">{description}</div>
            )}
          </div>
          {identity && <div className="auth-shell-identity">{identity}</div>}
          <div className="auth-shell-footer">
            {footer ?? (
              <Link className="text-link" href="/">
                Back to website
              </Link>
            )}
          </div>
        </div>
        <div className="auth-shell-content">{children}</div>
      </div>
    </main>
  );
}
