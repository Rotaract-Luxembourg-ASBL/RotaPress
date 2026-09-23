import { services } from "@/composition/services";
import { handle, json } from "@/core/http";

export async function GET() {
  return handle(async () =>
    json({ form: await services.forms.publishedMembershipForm() }),
  );
}
