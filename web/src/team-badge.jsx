import badgeMap from "./team-badges.json";
import { resolveTeamBadge } from "./team-badge.js";

/**
 * Serie A club badge, looked up by team name in team-badges.json (built by
 * advisor/fetch_team_badges.py). Falls back to an initials circle for any
 * team not yet in that map, so a missing logo never shows as a broken
 * image or a generic placeholder icon. See team-badge.js for the
 * (unit-tested) logic behind this choice.
 */
export function TeamBadge({ team, size = 24 }) {
  const badge = resolveTeamBadge({ team, size, badges: badgeMap });
  if (badge.kind === "image") {
    return (
      <img
        className="team-badge"
        src={badge.src}
        width={badge.width}
        height={badge.height}
        style={{ width: badge.width, height: badge.height }}
        alt={badge.alt}
        loading="lazy"
      />
    );
  }
  return (
    <span
      className="team-badge team-badge-fallback"
      style={{ width: badge.width, height: badge.height, fontSize: badge.fontSize }}
      role="img"
      aria-label={badge.alt}
    >
      {badge.initials}
    </span>
  );
}
