"use client";

import type { ReactNode } from "react";
import { ActionsMenu } from "@/ui/actions-menu";

/** Native disclosure: ordinary buttons retain Tab navigation and modal focus. */
export function EventActionsMenu({
  children,
  label = "Event actions",
}: {
  children: ReactNode;
  label?: string;
}) {
  return <ActionsMenu label={label}>{children}</ActionsMenu>;
}
