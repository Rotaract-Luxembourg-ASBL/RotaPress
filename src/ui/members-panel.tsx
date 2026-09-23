"use client";

import { useState, type FormEvent } from "react";
import {
  type Member,
  type MembershipRole,
  type MembershipStatus,
  errorMessage,
  request,
  useResource,
} from "./api";
import { useCurrentUser } from "./admin-shell";
import { Loading, Notice, PageHeading } from "./primitives";
import {
  Collection,
  CollectionEmpty,
  CollectionRow,
  CollectionToolbar,
  FilterTabs,
  StatusBadge,
  SummaryStats,
} from "./collection";
import { Dialog } from "./dialog";

const roleLabels: Record<MembershipRole, string> = {
  owner: "Owner",
  administrator: "Administrator",
  editor: "Content Editor",
  member: "Member",
};
const statuses: MembershipStatus[] = [
  "pending",
  "approved",
  "suspended",
  "rejected",
  "former",
];

function MemberAccess({
  member,
  protectedReason,
  onClose,
  onSaved,
}: {
  member: Member;
  protectedReason?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const me = useCurrentUser();
  const [status, setStatus] = useState(member.status);
  const [role, setRole] = useState(member.role);
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string>();
  const changed = status !== member.status || role !== member.role;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reviewing) {
      setReviewing(true);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await request("/api/admin/members", {
        method: "PATCH",
        body: JSON.stringify({ membershipId: member.id, status, role }),
      });
      onSaved();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="Manage access"
      onClose={onClose}
      canClose={() =>
        !busy &&
        (!changed || window.confirm("Discard this unsaved access change?"))
      }
    >
      <form className="form-stack" onSubmit={save} aria-busy={busy}>
        <div>
          <h3>{member.name || "Club member"}</h3>
          <p className="muted">{member.email}</p>
        </div>
        {protectedReason && <Notice kind="info">{protectedReason}</Notice>}
        {error && <Notice>{error}</Notice>}
        {reviewing ? (
          <div className="change-summary">
            <h3>Review access change</h3>
            <p>
              Membership: {member.status} → <strong>{status}</strong>
            </p>
            <p>
              Role: {roleLabels[member.role]} →{" "}
              <strong>{roleLabels[role]}</strong>
            </p>
            <p>
              {status === "approved"
                ? "This person will receive the permissions of the selected role."
                : "This person will not have staff access."}{" "}
              The change takes effect immediately.
            </p>
          </div>
        ) : (
          <>
            <label>
              Membership status
              <select
                value={status}
                disabled={busy || Boolean(protectedReason)}
                onChange={(e) => setStatus(e.target.value as MembershipStatus)}
              >
                {statuses.map((value) => (
                  <option key={value} value={value}>
                    {value.charAt(0).toUpperCase() + value.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Club role
              <select
                value={role}
                disabled={busy || Boolean(protectedReason)}
                onChange={(e) => setRole(e.target.value as MembershipRole)}
              >
                {Object.entries(roleLabels).map(([value, label]) => (
                  <option
                    key={value}
                    value={value}
                    disabled={
                      value === "owner" &&
                      !me.capabilities.includes("ownership.manage")
                    }
                  >
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <p className="field-help">
          Sensitive changes require a recent sign-in. Signing in alone does not
          approve membership.
        </p>
        <div className="admin-actions">
          {reviewing && (
            <button
              type="button"
              className="button button-outline"
              disabled={busy}
              onClick={() => setReviewing(false)}
            >
              Back
            </button>
          )}
          <button
            className="button button-accent"
            disabled={busy || !changed || Boolean(protectedReason)}
          >
            {busy
              ? "Saving…"
              : reviewing
                ? "Confirm access change"
                : "Review changes"}
          </button>
        </div>
        <p className="field-help" role="status">
          {busy
            ? "Saving access change…"
            : changed
              ? "Unsaved access change"
              : "No changes"}
        </p>
      </form>
    </Dialog>
  );
}

export function MembersPanel() {
  const me = useCurrentUser();
  const { data, error, refresh } = useResource<{ members: Member[] }>(
    "/api/admin/members",
  );
  const [selected, setSelected] = useState<Member>();
  const [saved, setSaved] = useState(false);
  const [view, setView] = useState("approved");
  const [query, setQuery] = useState("");
  const canManage = me.capabilities.includes("members.manage");
  const pending = data?.members.filter(
    (member) => member.status === "pending",
  ).length;
  const owners = data?.members.filter(
    (member) => member.status === "approved" && member.role === "owner",
  ).length;
  function protectedReason(member: Member) {
    if (member.role === "owner" && member.status === "approved" && owners === 1)
      return "Last active owner. Assign another approved owner before changing this membership or role.";
    if (
      member.role === "owner" &&
      !me.capabilities.includes("ownership.manage")
    )
      return "Only an owner can change another owner's access.";
    if (member.email === me.actor?.email && me.membership?.role !== "owner")
      return "Another authorized owner must change your own staff permissions.";
    return undefined;
  }
  const members = data?.members.filter(
    (member) =>
      (view === "all" || member.status === view) &&
      `${member.name} ${member.email}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <>
      <PageHeading
        title="Members"
        description="Review applications and manage your club's access."
      />
      {error && (
        <Notice>
          {error}{" "}
          <button className="inline-button" onClick={refresh}>
            Try again
          </button>
        </Notice>
      )}
      {saved && (
        <Notice kind="success">
          Membership updated. Current permissions take effect immediately.
        </Notice>
      )}
      {data && (
        <SummaryStats
          label="Membership counts"
          items={[
            {
              label: "Approved members",
              value: data.members.filter((item) => item.status === "approved")
                .length,
              hint: "Current club memberships",
              icon: "members",
              onClick: () => setView("approved"),
              selected: view === "approved",
            },
            {
              label: "Pending applications",
              value: pending ?? 0,
              hint: "Waiting for review",
              icon: "forms",
              onClick: () => setView("pending"),
              selected: view === "pending",
            },
            {
              label: "All memberships",
              value: data.members.length,
              hint: "Includes inactive memberships",
              icon: "members",
              onClick: () => setView("all"),
              selected: view === "all",
            },
          ]}
        />
      )}
      <Collection
        label="Club directory"
        noun="Member"
        detailLabel="Club role"
        toolbar={
          <>
            <FilterTabs
              label="Membership views"
              value={view}
              onChange={setView}
              options={[
                {
                  value: "approved",
                  label: "Approved members",
                  count: data?.members.filter(
                    (item) => item.status === "approved",
                  ).length,
                },
                {
                  value: "pending",
                  label: "Pending applications",
                  count: pending,
                },
                {
                  value: "all",
                  label: "All memberships",
                  count: data?.members.length,
                },
                ...(["suspended", "rejected", "former"] as const).map(
                  (value) => ({
                    value,
                    label: value[0].toUpperCase() + value.slice(1),
                    count: data?.members.filter((item) => item.status === value)
                      .length,
                  }),
                ),
              ]}
            />
            <CollectionToolbar
              searchLabel="Search members"
              query={query}
              onQuery={setQuery}
            >
              {query && (
                <button
                  className="button button-outline"
                  onClick={() => setQuery("")}
                >
                  Clear search
                </button>
              )}
            </CollectionToolbar>
          </>
        }
        footer={
          data &&
          (members?.length ?? 0) +
            " of " +
            data.members.length +
            " memberships shown"
        }
      >
        {!data && !error && <Loading />}
        {data && (
          <>
            <ul className="admin-collection-rows">
              {members?.map((member) => (
                <CollectionRow
                  key={member.id}
                  icon={
                    <span aria-hidden="true">
                      {(member.name || member.email).slice(0, 1).toUpperCase()}
                    </span>
                  }
                  title={
                    <>
                      {member.name || "Club member"}
                      {member.email === me.actor?.email && (
                        <span className="small muted"> · You</span>
                      )}
                    </>
                  }
                  description={
                    <span className="member-identity">
                      <span>
                        {member.email}
                        {member.role === "owner" &&
                          member.status === "approved" &&
                          owners === 1 && (
                            <>
                              <br />
                              Last active owner
                            </>
                          )}
                      </span>
                    </span>
                  }
                  status={
                    <StatusBadge
                      tone={
                        member.status === "approved"
                          ? "success"
                          : member.status === "pending"
                            ? "warning"
                            : member.status === "suspended"
                              ? "danger"
                              : "neutral"
                      }
                    >
                      {member.status[0].toUpperCase() + member.status.slice(1)}
                    </StatusBadge>
                  }
                  detail={{ label: "Role", value: roleLabels[member.role] }}
                  actions={
                    canManage ? (
                      <button
                        className="button button-outline"
                        onClick={() => {
                          setSelected(member);
                          setSaved(false);
                        }}
                      >
                        Manage access
                      </button>
                    ) : (
                      <span className="small muted">View only</span>
                    )
                  }
                />
              ))}
            </ul>
            {!members?.length && (
              <CollectionEmpty
                icon="members"
                title={
                  view === "pending"
                    ? "No pending applications"
                    : "No members to show"
                }
                description={
                  query
                    ? "Try another name or email."
                    : "Membership applications appear here when people apply."
                }
              >
                {query && (
                  <button
                    className="button button-outline"
                    onClick={() => setQuery("")}
                  >
                    Clear search
                  </button>
                )}
              </CollectionEmpty>
            )}
          </>
        )}
      </Collection>
      <p className="permission-note">
        Only approved members receive their role's permissions. Review each
        application before approving access.
      </p>
      {selected && (
        <MemberAccess
          member={selected}
          protectedReason={protectedReason(selected)}
          onClose={() => setSelected(undefined)}
          onSaved={() => {
            setSelected(undefined);
            setSaved(true);
            refresh();
          }}
        />
      )}
    </>
  );
}
