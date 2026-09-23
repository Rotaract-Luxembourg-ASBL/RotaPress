import { redirect } from "next/navigation";
export default function WebsiteKits() {
  redirect("/admin/website?tab=templates");
}
