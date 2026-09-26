import { services } from "@/composition/services";
import { handle, json } from "@/core/http";

export const dynamic = "force-dynamic";
export function GET() {
  return handle(async () =>
    json({ items: await services.projectReader.publicList() }),
  );
}
