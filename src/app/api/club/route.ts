import { services } from "@/composition/services";
import { handle, json } from "@/core/http";

export async function GET() {
  return handle(async () => json(await services.organization.publicIdentity()));
}
