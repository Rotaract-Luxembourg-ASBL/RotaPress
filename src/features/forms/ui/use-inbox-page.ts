"use client";

import { useCallback, useEffect, useState } from "react";
import { errorMessage, request } from "@/ui/api";
import type { InboxPage } from "../inbox_schemas";

/** A changed filter must not show responses from the previous filter. */
export function useInboxPage(path: string) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    path: string;
    data?: InboxPage;
    forms?: InboxPage["forms"];
    error?: string;
  }>();
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    request<InboxPage>(path)
      .then((data) => {
        if (active) setResult({ path, data, forms: data.forms });
      })
      .catch((cause: unknown) => {
        if (active)
          setResult((previous) => ({
            path,
            forms: previous?.forms,
            error: errorMessage(cause),
          }));
      });
    return () => {
      active = false;
    };
  }, [path, revision]);

  return {
    data: result?.path === path ? result.data : undefined,
    error: result?.path === path ? result.error : undefined,
    forms: result?.forms,
    refresh,
  };
}
