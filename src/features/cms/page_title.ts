/** One consistent browser/search/social title, without duplicating an existing suffix. */
export function clubPageTitle(pageTitle: string, clubName: string): string {
  const title = pageTitle.trim();
  const name = clubName.trim();
  if (!name) return title;
  if (!title || title.toLocaleLowerCase() === name.toLocaleLowerCase())
    return name;
  for (const separator of [" | ", " · ", " — ", " - "]) {
    const suffix = separator + name;
    if (title.toLocaleLowerCase().endsWith(suffix.toLocaleLowerCase())) {
      return `${title.slice(0, -suffix.length)} | ${name}`;
    }
  }
  return `${title} | ${name}`;
}
