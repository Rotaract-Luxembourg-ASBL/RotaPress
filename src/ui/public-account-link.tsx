"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useResource, type CurrentUser } from "./api";

const AccountContext = createContext({ signedIn: false, staff: false });

/** Session-aware chrome stays private and does not change cached page content. */
export function PublicAccountProvider({
  children,
  preview = false,
}: {
  children: ReactNode;
  preview?: boolean;
}) {
  const pathname = usePathname();
  const { data, refresh } = useResource<CurrentUser>(
    preview ? null : `/api/me?view=${encodeURIComponent(pathname)}`,
  );
  useEffect(() => {
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);
  return (
    <AccountContext.Provider
      value={{
        signedIn: Boolean(data?.actor),
        staff: Boolean(data?.actor && data.capabilities.length),
      }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export function PublicAccountLink({
  href = "/sign-in?next=/membership",
  className,
  children = "Member login",
}: {
  href?: string;
  className?: string;
  children?: ReactNode;
}) {
  const { signedIn } = useContext(AccountContext);
  return (
    <Link className={className} href={signedIn ? "/membership" : href}>
      {signedIn ? "My account" : children}
    </Link>
  );
}

export function PublicAdministrationLink() {
  const { staff } = useContext(AccountContext);
  return staff ? <Link href="/admin">Administration</Link> : null;
}
