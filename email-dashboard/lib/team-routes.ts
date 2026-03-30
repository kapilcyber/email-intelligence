/** URL slug for a team name under /teams/:slug */
export function teamNameToSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/gi, "");
}

/** Resolve slug from URL to exact team name from API list. */
export function matchTeamSlug(slug: string, teamNames: string[]): string | undefined {
  const normalized = slug.trim().toLowerCase();
  return teamNames.find((n) => teamNameToSlug(n) === normalized);
}
