"use client";

import Link from "next/link";
import { useEffect } from "react";
import type { AccountWorkspace } from "@/features/members/profile_schemas";
import { ActionsMenu } from "./actions-menu";
import { type CurrentUser, useResource } from "./api";
import { Icon } from "./icon";
import { Notice } from "./primitives";
import { SignOutButton } from "./sign-out-button";

export function AdminAccountMenu({ me }: { me: CurrentUser }) {
  const { data, error, refresh } =
    useResource<AccountWorkspace>("/api/account");
  useEffect(() => {
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);
  const name = data?.profile.displayName || me.actor?.name || "My account";
  const initials = data?.profile.displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const role = me.capabilities.includes("admin.access")
    ? {
        owner: "Owner",
        administrator: "Administrator",
        editor: "Content editor",
        member: "Member",
      }[me.membership?.role ?? "member"]
    : "Event team";

  return (
    <div className="admin-account">
      <ActionsMenu
        label="Open account menu"
        trigger={
          <>
            <span className="admin-avatar" aria-hidden="true" data-private>
              {initials || <Icon name="user" />}
            </span>
            <span className="admin-account-label">
              <strong data-private>{name}</strong>
              <span>{role}</span>
            </span>
            <Icon name="down" width={16} height={16} />
          </>
        }
      >
        <div className="admin-account-identity">
          <strong data-private>{name}</strong>
          <span data-private>{me.actor?.email}</span>
          <span className="admin-role-label">{role}</span>
        </div>
        {error && (
          <Notice>
            Your profile could not be loaded.{" "}
            <button className="inline-button" onClick={refresh}>
              Try again
            </button>
          </Notice>
        )}
        <Link href="/membership?tab=profile">
          <Icon name="user" /> My profile
        </Link>
        <Link href="/membership">
          <Icon name="overview" /> Member portal
        </Link>
        <Link href="/">
          <Icon name="external" /> Club website
        </Link>
        <div className="admin-account-signout">
          <SignOutButton />
        </div>
      </ActionsMenu>
    </div>
  );
}
