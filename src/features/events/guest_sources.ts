/** Internal scoped record projection for explicit guest grants, never public discovery. */
export type GuestSource = {
  kind: "native" | "luma";
  id: string;
  sourceId?: string;
  sourceLabel?: string;
  userId: string | null;
  name: string;
  email: string;
  status: string;
  available: boolean;
  observedAt: string | null;
};
