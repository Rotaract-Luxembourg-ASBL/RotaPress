import { MyRegistrations } from "@/features/events/ui/my-registrations";
import { PublishedSiteShell } from "@/ui/published-site-shell";
export const metadata = {
  title: "My registrations",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <PublishedSiteShell>
      <main id="main-content" className="content-width forms-public-page">
        <section className="panel">
          <MyRegistrations />
        </section>
      </main>
    </PublishedSiteShell>
  );
}
