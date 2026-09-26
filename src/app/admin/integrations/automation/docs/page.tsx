import { redirect } from "next/navigation";
export default function Page() {
  redirect("/admin/integrations/rest?tab=docs");
}
