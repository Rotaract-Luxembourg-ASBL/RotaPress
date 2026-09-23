import type { PublicPartner } from "./partner_schemas";

export type ProfileSelection = {
  selectionMode?: "selected" | "category";
  category?: "all" | "partner" | "sponsor" | "team";
  partnerIds: string[];
};
export function selectProfiles(
  selection: ProfileSelection,
  profiles: PublicPartner[],
): PublicPartner[] {
  const eligible = profiles.filter(
    (profile) =>
      selection.selectionMode !== "category" ||
      !selection.category ||
      selection.category === "all" ||
      profile.category === selection.category,
  );
  return selection.selectionMode === "category"
    ? eligible.slice(0, 40)
    : selection.partnerIds.flatMap(
        (id) => eligible.find((item) => item.id === id) ?? [],
      );
}
