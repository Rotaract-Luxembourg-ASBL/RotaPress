import type { ReactNode } from "react";
import { PublishedSiteShell } from "@/ui/published-site-shell";
import "./guest.css";
export const metadata = {
  title: "Guest portal",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <PublishedSiteShell>
      <main
        id="main-content"
        className="content-width forms-public-page guest-page"
      >
        <section className="panel form-stack">{children}</section>
      </main>
    </PublishedSiteShell>
  );
}
