import { redirect } from "next/navigation";
export const metadata = {
  title: "Review AI connection",
  referrer: "no-referrer" as const,
};
export default function Page() {
  redirect("/oauth/continue");
}
