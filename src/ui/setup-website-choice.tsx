"use client";

import Image from "next/image";
import type { KitId } from "@/features/cms/kits/catalogue";

export function SetupWebsiteChoice({
  value,
  onChange,
}: {
  value: KitId | null;
  onChange: (value: KitId | null) => void;
}) {
  return (
    <fieldset className="form-stack setup-template-choice">
      <legend>What should your website start with?</legend>
      <p className="field-help">
        A template includes its theme, homepage, inner pages, menu, header and
        footer. Everything starts as an editable private draft.
      </p>
      <div className="setup-template-options">
        {(
          [
            [
              "rotary-service",
              "Rotary Service",
              "Classic blue, service projects and club life.",
            ],
            [
              "rotaract-action",
              "Rotaract Action",
              "Cranberry, community action and young leaders.",
            ],
          ] as const
        ).map(([id, name, description]) => (
          <label key={id}>
            <Image
              src={`/kit-previews/${id}.png`}
              alt={`${name} website preview`}
              width={480}
              height={300}
            />
            <span>
              <input
                type="radio"
                name="templateId"
                checked={value === id}
                onChange={() => onChange(id)}
              />{" "}
              {name}
            </span>
            <span className="field-help">{description}</span>
          </label>
        ))}
        <label>
          <span>
            <input
              type="radio"
              name="templateId"
              checked={value === null}
              onChange={() => onChange(null)}
            />{" "}
            Start with a blank website
          </span>
          <span className="field-help">
            Create your own pages or choose a template later.
          </span>
        </label>
      </div>
    </fieldset>
  );
}
