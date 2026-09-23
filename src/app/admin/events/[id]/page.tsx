import { EventWorkspace } from "@/features/events/ui/event-workspace";
import { cmsLocaleSchema } from "@/features/cms/cms_schemas";
export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; page?: string; locale?: string }>;
}) {
  return (
    <EventWorkspace
      id={(await params).id}
      initialTab={(await searchParams).tab ?? "details"}
      initialPageId={(await searchParams).page}
      initialLocale={cmsLocaleSchema.parse((await searchParams).locale ?? "en")}
    />
  );
}
