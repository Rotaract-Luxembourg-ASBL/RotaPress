"use client";
import Link from "next/link";
import { useState } from "react";
import type { RegistrationDto } from "../registration_schemas";
import { useResource, request, errorMessage } from "@/ui/api";
import { Loading, Notice } from "@/ui/primitives";
export function MyRegistrations({ embedded = false }: { embedded?: boolean }) {
  const { data, error, refresh } = useResource<{
    registrations: RegistrationDto[];
  }>("/api/registrations");
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function cancel(row: RegistrationDto) {
    if (
      !window.confirm(
        `Cancel your place at ${row.eventTitle}? This releases your place for someone else.`,
      )
    )
      return;
    setBusy(true);
    setProblem(undefined);
    try {
      await request(`/api/registrations/${row.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ confirmed: true }),
      });
      refresh();
    } catch (cause) {
      setProblem(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {embedded ? <h2>My registrations</h2> : <h1>My registrations</h1>}
      <p>Review the places you have booked with the club.</p>
      {error && (
        <Notice>
          {error}{" "}
          <button className="inline-button" onClick={refresh}>
            Try again
          </button>{" "}
          <Link href="/sign-in?next=/registrations">Sign in</Link>
        </Notice>
      )}
      {problem && <Notice>{problem}</Notice>}
      {!data && !error ? (
        <Loading />
      ) : (
        <ul className="content-rows">
          {data?.registrations.map((row) => (
            <li className="content-row" key={row.id}>
              <div>
                <strong>{row.eventTitle}</strong>
                <p>
                  <span className="member-pill">
                    {row.status === "confirmed" ? "Confirmed" : "Cancelled"}
                  </span>{" "}
                  Booked {new Date(row.createdAt).toLocaleDateString()}
                </p>
              </div>
              {row.status === "confirmed" && (
                <button
                  className="button button-outline button-small"
                  disabled={busy}
                  onClick={() => void cancel(row)}
                >
                  Cancel registration
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {data?.registrations.length === 0 && (
        <p>You have no registrations yet.</p>
      )}
      {data?.registrations.length === 200 && (
        <p>Showing your most recent 200 registrations.</p>
      )}
      <Link href="/events" className="text-link">
        Browse events
      </Link>
      {!embedded && (
        <p>
          <Link href="/guest" className="text-link">
            Guest portal invitations
          </Link>
        </p>
      )}
    </>
  );
}
