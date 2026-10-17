import "server-only";
import { db } from "../../infrastructure/database/client";
import { ContentGeneration } from "./ContentGeneration";
import {
  contentGenerationHeader,
  isContentMutationPath,
} from "./content_boundary";

export async function requireContentGeneration(request: Request) {
  if (!isContentMutationPath(new URL(request.url).pathname)) return;
  const state = await ContentGeneration.installed(db);
  if (state)
    await ContentGeneration.assertCurrent(
      state.organizationId,
      request.headers.get(contentGenerationHeader) ?? undefined,
      db,
    );
}
