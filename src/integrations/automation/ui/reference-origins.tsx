"use client";
import { useId } from "react";

export function ReferenceOrigins({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const help = useId();
  const field = useId();
  return (
    <div className="form-stack">
      <label htmlFor={field}>Approved reference websites</label>
      <textarea
        id={field}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={2}
        required
        disabled={disabled}
        placeholder="https://www.example.org"
        aria-describedby={help}
      />
      <p id={help} className="small muted">
        Reference reading is selected. Add up to five HTTPS origins, one per
        line, without page paths. Include the exact hostname, including www when
        used.
      </p>
    </div>
  );
}
