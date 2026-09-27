import { scopeDefinitions, type AutomationScope } from "./scopes";

export function readOnlyScopes(scopes: readonly string[]) {
  return scopes.every(
    (scope) =>
      scope.endsWith(":read") ||
      ["media:inspect", "website:preview", "offline_access"].includes(scope),
  );
}

/** Describe the issued grant, never the registration's larger permission limit. */
export function permissionContext(scopes: readonly AutomationScope[]) {
  const grantedScopes = [...new Set(scopes)];
  return {
    grantedScopes,
    accessMode: readOnlyScopes(grantedScopes)
      ? ("read-only" as const)
      : ("read-write" as const),
    permissions: grantedScopes.map((scope) => ({
      scope,
      label: scopeDefinitions[scope].label,
    })),
  };
}

export function permissionInstructions(scopes: readonly AutomationScope[]) {
  const { accessMode, permissions } = permissionContext(scopes);
  return `This connection has ${accessMode} access. Granted permissions: ${permissions.map(({ scope, label }) => `${scope} (${label})`).join("; ") || "none"}. Only these grants apply; actions allowed in connection settings are not grants until approved. Call automation_capabilities to check enabled features before acting. Current staff and record permissions are checked on every call.`;
}
