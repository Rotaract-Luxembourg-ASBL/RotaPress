"use client";
import { useId, useRef } from "react";
import { normalizeReferenceDomain, sourceRuleSchema } from "../source_rules";
import "./reference-origins.css";

export function referenceEntries(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/\s+/)
        .filter(Boolean)
        .map((entry) => {
          const rule = sourceRuleSchema.safeParse(entry.replace(/\/$/, ""));
          return rule.success ? rule.data : entry;
        }),
    ),
  ];
}

function combineDomainEntries(entries: string[], domain: string): string {
  let replaced = false;
  return entries
    .flatMap((entry) => {
      if (normalizeReferenceDomain(entry) !== domain) return [entry];
      if (replaced) return [];
      replaced = true;
      return [domain];
    })
    .join("\n");
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
  const input = useRef<HTMLTextAreaElement>(null);
  const entries = referenceEntries(value);
  const parsed = entries.map((entry) =>
    sourceRuleSchema.safeParse(entry.replace(/\/$/, "")),
  );
  const validRules = parsed.flatMap((rule) =>
    rule.success ? [rule.data] : [],
  );
  const invalid = parsed.find((rule) => !rule.success);
  const relatedEntries = new Map<string, string[]>();
  for (const entry of entries) {
    const domain = normalizeReferenceDomain(entry);
    if (domain)
      relatedEntries.set(domain, [
        ...(relatedEntries.get(domain) ?? []),
        entry,
      ]);
  }
  const suggestions = [...relatedEntries].filter(([domain, related]) =>
    related.some((entry) => entry !== domain),
  );
  const problem =
    entries.length > 5
      ? "Add no more than five reference website entries."
      : invalid && !invalid.success
        ? invalid.error.issues[0]?.message
        : undefined;
  return (
    <div className="form-stack reference-input">
      <label htmlFor={field}>Reference website domains</label>
      <textarea
        id={field}
        ref={input}
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
        Add up to five entries, one per line. A domain such as rotaract.lu
        includes its HTTPS website, www and all subdomains. Saved HTTPS origins
        allow only that exact host. Use the domain option below to combine
        related entries and include all subdomains.
      </p>
      {problem && (
        <p id={validation} className="small reference-input-problem">
          {problem}
        </p>
      )}
      {suggestions.map(([domain, related], index) => {
        const description = `${field}-domain-${index}`;
        return (
          <div className="reference-domain-choice" key={domain}>
            <p id={description} className="small muted">
              {related.length > 1
                ? `Combine ${related.length} entries for ${domain} into one domain.`
                : `Replace this entry with the domain ${domain}.`}{" "}
              This allows its HTTPS website and every subdomain.
            </p>
            <button
              type="button"
              className="button button-outline"
              disabled={disabled}
              aria-describedby={description}
              onClick={() => {
                onChange(combineDomainEntries(entries, domain));
                input.current?.focus();
              }}
            >
              Use {domain} and subdomains
            </button>
          </div>
        );
      })}
      {validRules.length > 0 && <ReferenceCoverage rules={validRules} />}
    </div>
  );
}
