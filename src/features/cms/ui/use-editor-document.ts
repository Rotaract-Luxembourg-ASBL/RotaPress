"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import type { Data } from "@puckeditor/core";
import { isSitePart, type CmsDetail } from "../cms_schemas";
import type { PuckBlocks } from "./puck-config";
import { ApiError, request, errorMessage } from "@/ui/api";
import { useEditorHistory } from "./use-editor-history";
import { useEditorCheckpoint } from "./use-editor-checkpoint";
import { observeEditorDocuments } from "./editor-documents";

export type DocumentOperation = "publish" | "unpublish" | "archive" | "restore";

export function useEditorDocument(initial: CmsDetail) {
  const router = useRouter();
  const [detail, setDetail] = useState(initial);
  // Job status may change while editing; never overwrite unsaved metadata or blocks.
  const reflectPublication = useCallback(
    (publishedRevisionId: string | null) => {
      setDetail((current) =>
        current.publishedRevisionId === publishedRevisionId
          ? current
          : { ...current, publishedRevisionId },
      );
    },
    [],
  );
  const readOnly = detail.archived;
  const [metadata, setMetadata] = useState(initial.draft);
  const [data, setData] = useState<Data<PuckBlocks>>({
    root: { props: {} },
    content: initial.draft.data.content,
  });
  const [editorKey, setEditorKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const history = useEditorHistory();
  const resetHistory = history.reset;
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [conflicted, setConflicted] = useState(false);
  const dirty =
    metadata.title !== detail.draft.title ||
    metadata.slug !== detail.draft.slug ||
    metadata.description !== detail.draft.description ||
    metadata.socialImageId !== detail.draft.socialImageId ||
    JSON.stringify(metadata.data.root) !==
      JSON.stringify(detail.draft.data.root) ||
    JSON.stringify(data.content) !== JSON.stringify(detail.draft.data.content);
  const base = `/api/admin/cms/content/${detail.id}`;
  const checkpoint = useEditorCheckpoint({
    base,
    locale: detail.locale,
    enabled: !busy && !readOnly,
    dirty,
    payload: {
      locale: detail.locale,
      expectedRevisionId: detail.draft.id,
      title: metadata.title,
      slug: metadata.slug,
      description: metadata.description,
      socialImageId: metadata.socialImageId,
      data: { root: metadata.data.root, content: data.content },
    },
  });

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const apply = useCallback(
    (next: CmsDetail, resetCanvas: boolean) => {
      setDetail(next);
      setMetadata(next.draft);
      setData({ root: { props: {} }, content: next.draft.data.content });
      if (resetCanvas) {
        resetHistory();
        setEditorKey((key) => key + 1);
      }
    },
    [resetHistory],
  );

  const save = useCallback(async () => {
    if (inFlight.current || readOnly) return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      await checkpoint.settle();
      const next = await request<CmsDetail>(`${base}/save`, {
        method: "POST",
        body: JSON.stringify({
          locale: detail.locale,
          expectedRevisionId: detail.draft.id,
          title: metadata.title,
          slug: metadata.slug,
          description: metadata.description,
          socialImageId: metadata.socialImageId,
          data: { root: metadata.data.root, content: data.content },
        }),
      });
      // Preserve selection and undo history unless server normalization changed the blocks.
      apply(
        next,
        JSON.stringify(next.draft.data.content) !==
          JSON.stringify(data.content),
      );
      setMessage("Draft saved. Your public page has not changed.");
      setConflicted(false);
      try {
        await checkpoint.discard();
      } catch {
        setMessage(
          "Draft saved. Your earlier recovery copy could not be cleared; review it when reopening this page.",
        );
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409)
        setConflicted(true);
      setError(`${errorMessage(cause)} Your entered content is still here.`);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [
    apply,
    base,
    data.content,
    readOnly,
    detail.draft.id,
    detail.locale,
    metadata,
    checkpoint,
  ]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (
        (event.ctrlKey || event.metaKey) &&
        (key === "z" || key === "y") &&
        (inFlight.current || readOnly)
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!document.querySelector("dialog[open]")) void save();
      }
    };
    return observeEditorDocuments((surface) => {
      surface.addEventListener("keydown", shortcut, true);
      return () => surface.removeEventListener("keydown", shortcut, true);
    });
  }, [readOnly, save]);

  async function operation(name: DocumentOperation, revisionId?: string) {
    if (inFlight.current || readOnly) return;
    if (dirty) {
      setError(
        "Save your entered content first. Publication and restoration use saved revisions.",
      );
      return;
    }
    const prompts = {
      archive:
        "Archive this content in every language and remove it from the public website?",
      unpublish:
        "Remove this language from the public website? Saved revisions will be kept.",
      restore:
        "Create a new draft from this revision? The live version will stay unchanged.",
      publish: null,
    };
    const prompt =
      isSitePart(detail.kind) && name !== "restore"
        ? name === "publish"
          ? `Publish this shared ${detail.kind}? ${detail.affectedPages.length} published club pages currently use it. Pages and event pages inherit the default selected in Site settings. Publishing an alternative does not select it as the default.`
          : `Remove this shared ${detail.kind}${name === "archive" ? " in every language" : ` in ${detail.locale.toUpperCase()}`}? Affected pages will use the original default layout. Saved revisions will be kept.`
        : prompts[name];
    if (prompt && !window.confirm(prompt)) return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const next = await request<CmsDetail>(`${base}/${name}`, {
        method: "POST",
        body: JSON.stringify({
          locale: detail.locale,
          expectedRevisionId: detail.draft.id,
          ...(revisionId ? { revisionId } : {}),
        }),
      });
      apply(next, name === "restore");
      setMessage(
        name === "publish"
          ? "Published. The website now shows this saved revision."
          : name === "restore"
            ? "Revision restored to a new draft. Publish deliberately when ready."
            : name === "archive"
              ? "Content archived."
              : "Unpublished. The content is no longer public.",
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function copy(
    event: FormEvent<HTMLFormElement>,
    action: "duplicate" | "locale",
  ) {
    event.preventDefault();
    if (inFlight.current || (readOnly && action === "locale")) return false;
    if (dirty) {
      setError("Save your entered changes before creating another draft.");
      return false;
    }
    const values = new FormData(event.currentTarget);
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await checkpoint.settle();
      const next = await request<CmsDetail>(`${base}/${action}`, {
        method: "POST",
        body: JSON.stringify({
          locale: values.get("locale") || detail.locale,
          title: values.get("title"),
          slug: values.get("slug"),
        }),
      });
      router.push(`/admin/website/${next.id}?locale=${next.locale}`);
      apply(next, true);
      setMessage(
        action === "locale"
          ? "Language draft created. Write the translation before publishing."
          : "Page duplicated as a draft.",
      );
      return true;
    } catch (cause) {
      setError(errorMessage(cause));
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return {
    detail,
    reflectPublication,
    metadata,
    setMetadata,
    data,
    setData,
    editorKey,
    history,
    readOnly,
    isLocked: () => inFlight.current || readOnly,
    busy,
    error,
    message,
    clearMessage: () => setMessage(undefined),
    dirty,
    save,
    operation,
    copy,
    checkpoint,
    conflicted,
    recoverCheckpoint: () => {
      const recovered = checkpoint.recover();
      if (!recovered) return;
      setMetadata({
        ...recovered.document,
        id: recovered.baseRevisionId,
        createdAt: recovered.updatedAt,
      });
      setData({
        root: { props: {} },
        content: recovered.document.data.content,
      });
      setDetail((current) => ({
        ...current,
        draft: { ...current.draft, id: recovered.baseRevisionId },
      }));
      setEditorKey((key) => key + 1);
      resetHistory();
      setConflicted(recovered.stale);
      setMessage(
        "Your recovery copy is open. Review and save it as a draft before publishing.",
      );
    },
    reviewLatest: async (keepEdits: boolean, expectedRevisionId: string) => {
      if (inFlight.current) return false;
      inFlight.current = true;
      setBusy(true);
      try {
        await checkpoint.settle();
        const latest = await request<CmsDetail>(
          `${base}?locale=${detail.locale}`,
        );
        if (latest.draft.id !== expectedRevisionId)
          throw new Error(
            "The saved draft changed again. Refresh the comparison before choosing a version.",
          );
        if (keepEdits) setDetail(latest);
        else apply(latest, true);
        if (!keepEdits) await checkpoint.discard();
        setConflicted(false);
        setError(undefined);
        setMessage(
          keepEdits
            ? "Your edits are ready to save over the latest draft. The public page is unchanged."
            : "The latest saved draft is open.",
        );
        return true;
      } catch (cause) {
        setError(errorMessage(cause));
        return false;
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
  };
}

export type EditorDocument = ReturnType<typeof useEditorDocument>;
