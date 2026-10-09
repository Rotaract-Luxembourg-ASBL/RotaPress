"use client";
import { useId } from "react";
import { normalizeReferenceDomain, sourceRuleSchema } from "../source_rules";
import "./reference-origins.css";

export function referenceEntries(value: string): string[] {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((entry) => {
      const rule = sourceRuleSchema.safeParse(entry.replace(/\/$/, ""));
      return rule.success ? rule.data : entry;
    });
}

export function ReferenceCoverage({ rules }: { rules: readonly string[] }) {
  return (
    <ul className="reference-coverage" aria-label="Reference website coverage">
      {rules.map((rule, index) => (
        <li key={`${rule}-${index}`}>
          <strong>{rule}</strong>
          <span>
            {rule.startsWith("https://")
              ? "Exact HTTPS host only · subdomains are not included"
              : `HTTPS ${rule} and all subdomains, including www.${rule}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

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
  const validation = useId();
  const entries = value.split(/\s+/).filter(Boolean);
  const parsed = entries.map((entry) =>
    sourceRuleSchema.safeParse(entry.replace(/\/$/, "")),
  );
  const validRules = parsed.flatMap((rule) =>
    rule.success ? [rule.data] : [],
  );
  const invalid = parsed.find((rule) => !rule.success);
  const problem =
    entries.length > 5
      ? "Add no more than five reference domains."
      : invalid && !invalid.success
        ? invalid.error.issues[0]?.message
        : undefined;
  return (
    <div className="form-stack reference-input">
      <label htmlFor={field}>Reference website domains</label>
      <textarea
        id={field}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={2}
        required
        disabled={disabled}
        placeholder="rotaract.lu"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        aria-invalid={Boolean(problem)}
        aria-describedby={`${help}${problem ? ` ${validation}` : ""}`}
      />
      <p id={help} className="small muted">
        Enter up to five domains, one per line. A domain includes its HTTPS
        website, www and all subdomains. Paste a website link and choose the
        domain option below to include its subdomains. Existing HTTPS entries
        keep exact-host access until you change them.
      </p>
      {problem && (
        <p id={validation} className="small reference-input-problem">
          {problem}
        </p>
      )}
      {entries.map((entry, index) => {
        const domain = normalizeReferenceDomain(entry);
        if (!domain || entry === domain) return null;
        return (
          <button
            key={`${entry}-${index}`}
            type="button"
            className="button button-outline"
            disabled={disabled}
            onClick={() =>
              onChange(
                entries
                  .map((current, at) => (at === index ? domain : current))
                  .join("\n"),
              )
            }
          >
            Use {domain} and subdomains
          </button>
        );
      })}
      {validRules.length > 0 && <ReferenceCoverage rules={validRules} />}
    </div>
  );
}
