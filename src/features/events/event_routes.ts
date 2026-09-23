/** Event pages use their own editor while retaining the existing CMS identity. */
export function eventPageEditorHref(
  eventId: string,
  pageId: string,
  locale: string,
) {
  return `/admin/events/${encodeURIComponent(eventId)}?tab=website&page=${encodeURIComponent(pageId)}&locale=${encodeURIComponent(locale)}`;
}
