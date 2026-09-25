"use client";

import {
  clubProfileLabels,
  type ClubProfile,
} from "@/core/organization/club_profile";

export function ClubProfileFields({
  value,
  onChange,
}: {
  value: ClubProfile;
  onChange: (profile: ClubProfile) => void;
}) {
  const update = (key: keyof ClubProfile, text: string) =>
    onChange({ ...value, [key]: text });
  function field(
    key: Exclude<keyof ClubProfile, "clubType">,
    type = "text",
    maxLength = 160,
  ) {
    return (
      <label key={key}>
        {clubProfileLabels[key]}
        <input
          type={type}
          name={key}
          value={value[key]}
          maxLength={maxLength}
          onChange={(event) => update(key, event.target.value)}
        />
      </label>
    );
  }
  return (
    <div className="form-stack">
      <p className="field-help">
        Optional public club information. Saved details can appear in connected
        website blocks. Leave personal or private information out.
      </p>
      <label>
        Club type
        <select
          value={value.clubType}
          onChange={(event) => update("clubType", event.target.value)}
        >
          <option value="community">Community organization</option>
          <option value="rotary">Rotary</option>
          <option value="rotaract">Rotaract</option>
          <option value="interact">Interact</option>
          <option value="other">Other</option>
        </select>
      </label>
      <div className="form-columns">
        {field("districtNumber", "text", 12)}
        {field("clubNumber", "text", 20)}
      </div>
      <div className="form-columns">
        {field("city")}
        {field("country")}
      </div>
      <details>
        <summary>Contact, meetings and club links</summary>
        <div className="form-stack">
          <div className="form-columns">
            {field("region")}
            {field("postalCode", "text", 24)}
          </div>
          {field("address", "text", 500)}
          <div className="form-columns">
            {field("publicEmail", "email", 254)}
            {field("phone", "tel", 60)}
          </div>
          <div className="form-columns">
            {field("charterDate", "date")}
            {field("sponsorClub")}
          </div>
          <label>
            Meeting details
            <textarea
              value={value.meetingDetails}
              maxLength={1000}
              rows={3}
              onChange={(event) => update("meetingDetails", event.target.value)}
              placeholder="When and where your club meets; how visitors can join."
            />
          </label>
          {field("meetingUrl", "url", 1000)}
          {field("websiteUrl", "url", 1000)}
          {field("polarisUrl", "url", 1000)}
          <p className="field-help">
            Use public HTTPS links. A Polaris link opens your club’s existing
            portal; it does not connect or import member data.
          </p>
        </div>
      </details>
    </div>
  );
}
