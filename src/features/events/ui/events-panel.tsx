"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCurrentUser } from "@/ui/admin-shell";
import { EventList } from "./event-list";
import { EventDirectoryEditor } from "./event-directory-editor";

export function EventsPanel() {
  const { capabilities } = useCurrentUser();
  const query = useSearchParams();
  const canDesign = capabilities.includes("cms.edit");
  const directory = query.get("tab") === "directory" && canDesign;
  const navigation = canDesign && (
    <nav className="admin-workspace-tabs" aria-label="Events workspace">
      <Link href="/admin/events" aria-current={!directory ? "page" : undefined}>
        All events
      </Link>
      <Link
        href="/admin/events?tab=directory"
        aria-current={directory ? "page" : undefined}
      >
        Directory design
      </Link>
    </nav>
  );
  return directory ? (
    <>
      {navigation}
      <EventDirectoryEditor />
    </>
  ) : (
    <EventList navigation={navigation} />
  );
}
