export function initialsFor(team) {
  const trimmed = (team || "").trim();
  if (!trimmed) return "?";
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words
      .slice(0, 3)
      .map((word) => word[0])
      .join("")
      .toUpperCase();
  }
  return trimmed.slice(0, 3).toUpperCase();
}

/**
 * Pure decision logic behind <TeamBadge>: given a team name, a pixel size
 * and the {team: url} map from team-badges.json, decides whether to render
 * the real badge image or an initials fallback. Kept separate from the JSX
 * so it's unit-testable without a DOM/JSX rendering toolchain.
 */
export function resolveTeamBadge({ team, size = 24, badges = {} }) {
  const src = badges[team];
  if (src) {
    return { kind: "image", src, alt: `Logo ${team}`, width: size, height: size };
  }
  return {
    kind: "fallback",
    initials: initialsFor(team),
    alt: `Logo ${team || "squadra sconosciuta"}`,
    width: size,
    height: size,
    fontSize: Math.max(8, Math.round(size * 0.4)),
  };
}
