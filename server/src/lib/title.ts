/**
 * Canonical form used to compare movie titles. Must stay identical to the
 * client's normalizeTitle in client/src/data/mockApi.ts so mock and real
 * answers agree: lowercase, every run of non-alphanumerics becomes one space.
 */
export function normalizeTitle(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function titlesMatch(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  return na.length > 0 && na === normalizeTitle(b);
}
