"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/core/auth/client";
import { signInErrorCallbackURL } from "@/core/auth/sign_in_destination";
import { en } from "@/locales/en";
import { errorMessage } from "./api";
import { Notice } from "./primitives";

export function SignOutButton({
  signInReturnTo,
  reauth = false,
}: {
  signInReturnTo?: string;
  reauth?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function signOut() {
    setBusy(true);
    setError(undefined);
    try {
      const result = await authClient.signOut();
      if (result.error)
        throw new Error(
          result.error.message || "Sign out failed. Please try again.",
        );
      window.dispatchEvent(new Event("rotapress-signed-out"));
      router.replace(
        signInReturnTo ? signInErrorCallbackURL(signInReturnTo, reauth) : "/",
      );
      router.refresh();
    } catch (cause: unknown) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  }

  return (
    <div aria-busy={busy || undefined}>
      {error && <Notice>{error}</Notice>}
      <button
        type="button"
        className="inline-button"
        onClick={signOut}
        disabled={busy}
      >
        {busy ? "Signing out…" : en.common.signOut}
      </button>
    </div>
  );
}
