import { getActor } from "@/core/auth/actor";
import { services } from "@/composition/services";
import { handle, json } from "@/core/http";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () =>
    json(
      await services.forms.publicForm(
        (await context.params).id,
        await getActor(request.headers),
      ),
    ),
  );
}
