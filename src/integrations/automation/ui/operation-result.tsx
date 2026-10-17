"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { TesterResult } from "./tester_request";
import { scopeDefinitions } from "../scopes";

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function content(body: unknown) {
  const root = object(body);
  const result = object(root?.result);
  const structured = object(result?.structuredContent);
  if (result?.isError === true && Array.isArray(result.content)) {
    const message = result.content
      .map(object)
      .find((item) => item?.type === "text");
    if (typeof message?.text === "string" && message.text.length <= 262144) {
      try {
        return object(JSON.parse(message.text));
      } catch {
        return { error: message.text };
      }
    }
  }
  if (object(root?.error)) return { error: object(root?.error)?.message };
  return object(structured?.data) ?? object(root?.data) ?? root;
}

const collectionTypes = [
  ["items", "Results"],
  ["members", "Members"],
  ["albums", "Albums"],
  ["forms", "Forms"],
  ["submissions", "Responses"],
  ["candidates", "Guest candidates"],
  ["grants", "Guest access"],
  ["revisions", "Revisions"],
] as const;
function count(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}
function resultText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.slice(0, 300) : null;
}

/** Only known collection fields are summarized; arbitrary payloads stay collapsed. */
function ResultCollections({ data }: { data: Record<string, unknown> | null }) {
  if (!data) return null;
  return collectionTypes.map(([key, label]) => {
    const items = data[key];
    if (!Array.isArray(items)) return null;
    return (
      <ResultCollection
        key={key}
        data={data}
        items={items}
        field={key}
        label={label}
      />
    );
  });
}

function ResultCollection({
  data,
  items,
  field,
  label,
}: {
  data: Record<string, unknown>;
  items: unknown[];
  field: string;
  label: string;
}) {
  const [position, setPosition] = useState(0);
  const start = Math.min(
    position,
    Math.max(0, Math.ceil(items.length / 50) - 1) * 50,
  );
  const pagination =
    object(
      field === "candidates" ? data.candidatePagination : data.pagination,
    ) ?? data;
  const total = count(pagination.total);
  const page = count(pagination.page);
  const size = count(pagination.pageSize);
  const offset = count(pagination.offset);
  const more =
    data.hasMore === true ||
    count(data.nextOffset) !== undefined ||
    (total !== undefined &&
      page !== undefined &&
      size !== undefined &&
      page * size < total);
  return (
    <section aria-label={label}>
      <h3>{label}</h3>
      <p>
        {items.length} returned
        {total !== undefined ? ` of ${total} total` : ""}
        {page && size && total !== undefined
          ? ` · Page ${page} of ${Math.max(1, Math.ceil(total / size))}`
          : offset !== undefined && items.length
            ? ` · Results ${offset + 1}–${offset + items.length}`
            : ""}
        {more ? " · More results available" : ""}
      </p>
      <ul className="automation-result-items">
        {items.slice(start, start + 50).map((item, index) => {
          const row = object(item);
          const asset = object(row?.asset);
          const draft = object(row?.draft);
          const title = [
            row?.title,
            row?.name,
            row?.formTitle,
            asset?.title,
            draft?.title,
            row?.eventTitle,
            row?.originalName,
            row?.id,
          ]
            .map(resultText)
            .find(Boolean);
          const details = [row?.status, row?.role, row?.email]
            .map(resultText)
            .filter(Boolean);
          return (
            <li key={index}>
              <strong>{title ?? `Result ${start + index + 1}`}</strong>
              {details.length > 0 && <span> · {details.join(" · ")}</span>}
            </li>
          );
        })}
      </ul>
      {items.length > 50 && (
        <nav
          className="collection-pagination"
          aria-label={`${label} returned records`}
        >
          <span role="status">
            {start + 1}–{Math.min(start + 50, items.length)} of {items.length}{" "}
            returned records
          </span>
          <button
            type="button"
            className="button button-outline"
            disabled={start === 0}
            onClick={() => setPosition(start - 50)}
          >
            Previous returned records
          </button>
          <button
            type="button"
            className="button button-outline"
            disabled={start + 50 >= items.length}
            onClick={() => setPosition(start + 50)}
          >
            Next returned records
          </button>
        </nav>
      )}
    </section>
  );
}

export function OperationResult({ result }: { result: TesterResult }) {
  const data = content(result.body);
  const image = object(data?.image);
  const base64 =
    image?.mimeType === "image/webp" &&
    typeof image.data === "string" &&
    image.data.length <= 819200 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(image.data)
      ? image.data
      : null;
  const reviewUrl =
    typeof data?.reviewUrl === "string" &&
    /^\/admin\/[a-zA-Z0-9/?=&_%.-]+$/.test(data.reviewUrl)
      ? data.reviewUrl
      : null;
  const scopes = Array.isArray(data?.grantedScopes)
    ? data.grantedScopes.filter(
        (item): item is string => typeof item === "string",
      )
    : null;
  const asset = object(data?.asset);
  const label =
    typeof data?.title === "string"
      ? data.title
      : typeof asset?.title === "string"
        ? asset.title
        : null;
  const error = typeof data?.error === "string" ? data.error : null;
  const connection = Boolean(
    data?.initialize && data?.tools && data?.resources,
  );
  const raw = JSON.stringify(result.body, null, 2) ?? "null";
  return (
    <section className="automation-result" aria-label="Test response">
      <p
        role="status"
        className={
          result.ok ? "automation-result-success" : "automation-result-error"
        }
      >
        {result.ok ? "Request succeeded" : "Request failed"} · HTTP{" "}
        {result.status}
      </p>
      {error && <p role="alert">{error}</p>}
      {label && <h3>{label}</h3>}
      {connection && (
        <p>
          The in-app MCP check completed initialization, discovery and a
          capabilities call. To verify your AI app separately, ask it to read
          RotaPress capabilities.
        </p>
      )}
      {scopes && (
        <div>
          <h3>Granted actions</h3>
          <ul>
            {scopes.map((scope) => (
              <li key={scope}>
                {Object.hasOwn(scopeDefinitions, scope)
                  ? scopeDefinitions[scope as keyof typeof scopeDefinitions]
                      .label
                  : scope}
              </li>
            ))}
          </ul>
          {!scopes.length && (
            <p>No content actions are granted to this connection.</p>
          )}
        </div>
      )}
      {base64 && (
        <Image
          src={`data:image/webp;base64,${base64}`}
          alt="Result preview"
          unoptimized
          width={typeof data?.width === "number" ? data.width : 1024}
          height={typeof data?.height === "number" ? data.height : 768}
          className="automation-result-image"
        />
      )}
      {Array.isArray(data?.warnings) &&
        data.warnings
          .filter((warning): warning is string => typeof warning === "string")
          .map((warning) => <p key={warning}>{warning}</p>)}
      <ResultCollections data={data} />
      {reviewUrl && (
        <Link className="button button-outline" href={reviewUrl}>
          Open in administration
        </Link>
      )}
      <details>
        <summary>Raw response</summary>
        <pre>{raw.slice(0, 200000)}</pre>
        {raw.length > 200000 && (
          <p>Response preview limited to 200,000 characters.</p>
        )}
      </details>
    </section>
  );
}
