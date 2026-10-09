import { z } from "zod";
import { parse } from "tldts";

function publicDomain(value: string): string | null {
  if (!value || /[\s/\\:@?#*%]/u.test(value)) return null;
  let hostname: string;
  try {
    hostname = new URL(`https://${value}`).hostname;
  } catch {
    return null;
  }
  if (
    hostname.length > 250 ||
    !hostname
      .split(".")
      .every((label) =>
        /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label),
      ) ||
    /(^|\.)(localhost|local|internal|test|invalid|example)$/u.test(hostname)
  )
    return null;
  const result = parse(hostname, {
    allowPrivateDomains: true,
    detectSpecialUse: true,
  });
  return result.domain &&
    !result.isIp &&
    !result.isSpecialUse &&
    (result.isIcann || result.isPrivate)
    ? hostname
    : null;
}

function safeHttpsURL(value: string | URL): URL | null {
  try {
    if (typeof value === "string" && /[\s\\]/u.test(value)) return null;
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.hash &&
      !url.port &&
      /^[a-z0-9.-]+$/u.test(url.hostname) &&
      url.hostname.includes(".") &&
      !/^\d+(\.\d+){3}$/u.test(url.hostname) &&
      !/(^|\.)(localhost|local|internal|test|invalid|example)$/u.test(
        url.hostname,
      )
      ? url
      : null;
  } catch {
    return null;
  }
}

function legacyOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      value === url.origin &&
      !url.username &&
      !url.password &&
      !url.port
      ? value
      : null;
  } catch {
    return null;
  }
}

function normalizedRule(value: string): string | null {
  if (value.startsWith("https://")) {
    const url = safeHttpsURL(value);
    // Existing persisted HTTPS rules keep their exact-origin authority.
    return url && value === url.origin ? value : null;
  }
  return publicDomain(value);
}

/** Bare domains include their descendants; legacy HTTPS origins remain exact. */
export const sourceRuleSchema = z
  .string()
  .trim()
  .min(2)
  .max(250)
  .refine(
    (value) => normalizedRule(value) !== null,
    "Use a public website domain such as rotaract.lu, or an exact HTTPS origin. Ports, paths, wildcards and public suffixes are not domain grants.",
  )
  .transform((value) => normalizedRule(value)!);

/** Old metadata may contain unusable private origins; preserve other grants,
 * while the URL/network boundary still refuses to fetch those hosts. */
export const storedSourceRulesSchema = z
  .array(
    z
      .string()
      .max(250)
      .refine(
        (value) =>
          normalizedRule(value) !== null || legacyOrigin(value) !== null,
      )
      .transform((value) => normalizedRule(value) ?? legacyOrigin(value)!),
  )
  .max(5)
  .default([]);

/** Suggest a registrable domain for a new, explicitly reviewed UI approval. */
export function normalizeReferenceDomain(value: string): string | null {
  const input = value.trim();
  const hostname = input.startsWith("https://")
    ? safeHttpsURL(input)?.hostname
    : publicDomain(input);
  if (!hostname || !publicDomain(hostname)) return null;
  return parse(hostname, { allowPrivateDomains: true }).domain;
}

/** Match only the supplied grant; never infer a parent domain from a saved origin. */
export function sourceRulesAllow(
  raw: string | URL,
  rules: readonly string[],
): boolean {
  const url = safeHttpsURL(raw);
  if (!url) return false;
  return rules.some((rule) => {
    if (rule.startsWith("https://")) return normalizedRule(rule) === url.origin;
    const domain = publicDomain(rule);
    return (
      domain !== null &&
      (url.hostname === domain || url.hostname.endsWith(`.${domain}`))
    );
  });
}
