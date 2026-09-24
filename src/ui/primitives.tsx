import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { en } from "@/locales/en";

export function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <span aria-hidden="true">{diagonal ? "↗" : "→"}</span>;
}

export function Brand({
  name = en.product,
  compact = false,
}: {
  name?: string;
  compact?: boolean;
}) {
  return (
    <Link href="/" className="brand" aria-label={`${name} home`}>
      <Image
        src={
          compact || name !== en.product
            ? "/brand/rotapress-mark.svg"
            : "/brand/rotapress-logo.svg"
        }
        width={compact || name !== en.product ? 36 : 185}
        height={36}
        alt=""
        className="rotapress-logo"
        priority
      />
      {!compact && name !== en.product && <span>{name}</span>}
    </Link>
  );
}

export function Notice({
  children,
  kind = "error",
}: {
  children: ReactNode;
  kind?: "error" | "success" | "info";
}) {
  return (
    <div
      className={`notice notice-${kind}`}
      role={kind === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}

export function Loading() {
  return (
    <div className="loading-state" role="status">
      <span className="loading-dot" />
      {en.common.loading}
    </div>
  );
}

export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {children}
    </div>
  );
}
