"use client";

import Link from "next/link";
import { MediaPicker } from "@/ui/media-picker";
import type { ProjectContent } from "../project_schemas";
import { projectStatusLabels } from "./project-public";

export function ProjectFields({
  draft,
  change,
  disabled,
  canManageMedia,
}: {
  draft: ProjectContent;
  change: (value: Partial<ProjectContent>) => void;
  disabled: boolean;
  canManageMedia: boolean;
}) {
  return (
    <fieldset className="editor-fieldset project-fields" disabled={disabled}>
      <section className="panel form-stack" aria-label="Project story">
        <div>
          <h2>Tell your story</h2>
          <p className="field-help">
            Help people understand what your club is doing and why it matters.
          </p>
        </div>
        <label>
          Project title
          <input
            required
            maxLength={160}
            value={draft.title}
            onChange={(event) => change({ title: event.target.value })}
          />
        </label>
        <label>
          Short summary
          <textarea
            aria-label="Short summary"
            maxLength={320}
            rows={3}
            value={draft.summary}
            onChange={(event) => change({ summary: event.target.value })}
          />
          <span className="field-help">
            A short introduction shown in project lists. Required before
            publication.
          </span>
        </label>
        <label>
          Project story
          <textarea
            aria-label="Project story"
            maxLength={12000}
            rows={9}
            value={draft.story}
            onChange={(event) => change({ story: event.target.value })}
            placeholder="What inspired the project? What are your volunteers doing?"
          />
          <span className="field-help">
            Use blank lines to separate paragraphs.
          </span>
        </label>
        <label>
          Results and impact
          <textarea
            aria-label="Results and impact"
            maxLength={4000}
            rows={5}
            value={draft.outcomes}
            onChange={(event) => change({ outcomes: event.target.value })}
            placeholder="Share what changed, what you learned or what comes next."
          />
          <span className="field-help">
            Optional. Share real outcomes when you have them.
          </span>
        </label>
      </section>
      <div className="form-stack">
        <section className="panel form-stack" aria-label="Project details">
          <h2>Project details</h2>
          <label>
            Progress
          <select
            aria-label="Progress"
            value={draft.status}
              onChange={(event) =>
                change({
                  status: event.target.value as ProjectContent["status"],
                })
              }
            >
              {Object.entries(projectStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <span className="field-help">
              Describes the activity. Publication is a separate choice.
            </span>
          </label>
          <label>
            Location
            <input
              maxLength={160}
              value={draft.location}
              onChange={(event) => change({ location: event.target.value })}
              placeholder="Optional place or area"
            />
          </label>
          <div className="project-date-fields">
            <label>
              Start date
              <input
                type="date"
                value={draft.startDate ?? ""}
                onChange={(event) =>
                  change({ startDate: event.target.value || null })
                }
              />
            </label>
            <label>
              End date
              <input
                type="date"
                min={draft.startDate ?? undefined}
                value={draft.endDate ?? ""}
                onChange={(event) =>
                  change({ endDate: event.target.value || null })
                }
              />
            </label>
          </div>
          <p className="field-help">
            Dates are optional. For a one-day action, use the same start and end
            date.
          </p>
        </section>
        <section className="panel form-stack" aria-label="Project cover">
          <h2>Cover image</h2>
          {canManageMedia ? (
            <MediaPicker
              label="Choose cover image"
              value={draft.coverImageId ?? ""}
              onChange={(id) => change({ coverImageId: id || null })}
            />
          ) : (
            <p className="field-help">
              A staff member with Media permission can choose a cover image.
            </p>
          )}
          <p className="field-help">
            Optional. The image must be public before this project can be
            published.
            {canManageMedia && (
              <>
                {" "}
                Review visibility and alternative text in{" "}
                <Link href="/admin/media" target="_blank" className="text-link">
                  Media
                </Link>
                .
              </>
            )}
          </p>
        </section>
        <section className="panel form-stack" aria-label="Project link">
          <h2>Invite people to learn more</h2>
          <p className="field-help">
            Optional. Link to a volunteer form, related event or partner
            website.
          </p>
          <label>
            Link label
            <input
              maxLength={80}
              value={draft.linkLabel ?? ""}
              onChange={(event) => change({ linkLabel: event.target.value })}
              placeholder="For example, Volunteer with us"
            />
          </label>
          <label>
            Link address
            <input
              maxLength={2000}
              value={draft.linkUrl ?? ""}
              onChange={(event) => change({ linkUrl: event.target.value })}
              placeholder="https:// or /pages/en/volunteer"
            />
          </label>
        </section>
      </div>
    </fieldset>
  );
}
