import type { ProjectContent, ProjectDto } from "../project_schemas";

type EnteredProject = { saved: ProjectDto; draft: ProjectContent };
const entered = new Map<string, EnteredProject>();
let actor: string | null = null;
let listening = false;

/** Same-tab recovery only. Never persist private editorial input in browser storage. */
export function recoverProject(actorEmail: string | null, id: string) {
  if (actor !== actorEmail) {
    entered.clear();
    actor = actorEmail;
  }
  if (typeof window !== "undefined" && !listening) {
    const clear = () => {
      entered.clear();
      actor = null;
    };
    window.addEventListener("rotapress-signed-out", clear);
    window.addEventListener("pagehide", clear);
    listening = true;
  }
  return entered.get(id);
}

export function retainProject(saved: ProjectDto, draft: ProjectContent) {
  if (JSON.stringify(saved.draft) === JSON.stringify(draft)) {
    entered.delete(saved.id);
    return;
  }
  entered.delete(saved.id);
  entered.set(saved.id, { saved, draft });
  if (entered.size > 5) entered.delete(entered.keys().next().value!);
}

export function discardProject(id: string) {
  entered.delete(id);
}
