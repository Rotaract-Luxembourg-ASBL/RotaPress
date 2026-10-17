"use client";
import Link from "next/link";
import { useState } from "react";
import type { RegistrationDto } from "../registration_schemas";
import { useResource, request, errorMessage } from "@/ui/api";
import { Loading, Notice } from "@/ui/primitives";
import { useCollectionLocation } from "@/ui/collection-location";
import { CollectionPagination } from "@/ui/collection-pagination";
import type { CollectionPage } from "@/core/collections";
export function MyRegistrations({ embedded = false }: { embedded?: boolean }) {
  const { params, change } = useCollectionLocation();
  const page = Number(params.get("bookingsPage")) || 1;
  const status = params.get("bookingsStatus") ?? "all";
  const search = params.get("bookingsSearch") ?? "";
  const { data, error, refresh } = useResource<
    CollectionPage & {
      registrations: RegistrationDto[];
    }
  >(
    `/api/registrations?${new URLSearchParams({ page: String(page), status, search })}`,
  );
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
      <div className="admin-actions">
        <label>
          Find a booking
          <input
            type="search"
            value={search}
            onChange={(event) =>
              change(
                { bookingsSearch: event.target.value, bookingsPage: 1 },
                false,
              )
            }
          />
        </label>
        <label>
          Status
          <select
            value={status}
            onChange={(event) =>
              change(
                { bookingsStatus: event.target.value, bookingsPage: 1 },
                false,
              )
            }
          >
            <option value="all">All bookings</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
      </div>
      {error && (
        <Notice>
          {error}{" "}
          <button className="inline-button" onClick={refresh}>
            Try again
          </button>{" "}
          <Link
            href={`/sign-in?next=${encodeURIComponent(embedded ? `/membership?${params}` : `/registrations?${params}`)}`}
          >
            Sign in
          </Link>
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
      {data && (
        <CollectionPagination
          {...data}
          noun="bookings"
          onPage={(next) => change({ bookingsPage: next }, false)}
        />
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
