import { playerStatusBadge } from "./player-status-client.js";

/** Tiny "cartellino" swatch (color + shape only, no visible text) for a player's injury/suspension status, if any. */
export function PlayerStatusBadge({ players, name }) {
  const badge = playerStatusBadge(players, name);
  if (!badge) return null;
  return (
    <i
      className={`player-status-badge ${badge.className}`}
      role="img"
      aria-label={badge.ariaLabel}
      title={badge.title}
    />
  );
}
