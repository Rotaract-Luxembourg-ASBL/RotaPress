/** Permit only implemented local entry points; never accept an arbitrary return URL. */
export function signInDestination(next: string | null): string {
  const fixed = [
    "/setup",
    "/admin",
    "/admin/settings",
    "/admin/calendar",
    "/admin/integrations/google",
    "/admin/integrations/automation",
    "/admin/integrations/rest",
    "/admin/integrations/mcp",
    "/admin/integrations/automation/docs",
    "/admin/integrations/automation/authorize",
    "/membership",
    "/recovery",
    "/guest",
    "/registrations",
    "/calendar",
    "/calendar?tab=subscriptions",
  ];
  if (next && fixed.includes(next)) return next;
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  // These are the destinations already emitted by the reusable public form UI.
  if (
    next &&
    (new RegExp(`^/forms/${uuid}$`).test(next) ||
      new RegExp(`^/events/${uuid}/(en|fr|lb)/(registration|website)$`).test(
        next,
      ))
  )
    return next;
  return "/membership";
}

/** Return failed Google flows to sign-in without losing the supported destination. */
export function signInErrorCallbackURL(
  returnTo: string,
  reauth = false,
): string {
  const query = new URLSearchParams({ next: signInDestination(returnTo) });
  if (reauth) query.set("reauth", "1");
  return `/sign-in?${query.toString()}`;
}
