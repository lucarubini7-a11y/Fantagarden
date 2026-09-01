import { apiFetch } from "./api-client.js";

/** Fetches /api/player-status. Never throws: any failure resolves to an empty result. */
export async function fetchPlayerStatus(apiBase, { fetchImpl = apiFetch, forceRefresh = false } = {}) {
  try {
    const url = `${String(apiBase || "").replace(/\/$/, "")}/api/player-status${forceRefresh ? "?refresh=1" : ""}`;
    const response = await fetchImpl(url);
    if (!response.ok) return { fetchedAt: null, players: {} };
    const payload = await response.json();
    const players = payload?.players;
    return {
      fetchedAt: payload?.fetched_at ?? null,
      players: players && typeof players === "object" ? players : {},
    };
  } catch {
    return { fetchedAt: null, players: {} };
  }
}

// A literal "cartellino": color and shape alone read as infortunato/diffidato/in
// dubbio the same way a football card does, no legend needed. ariaLabel carries
// the full word for anyone not seeing the color (screen reader, color-blindness).
const BADGES = {
  infortunato: { ariaLabel: "Infortunato", className: "player-status-inf" },
  diffidato: { ariaLabel: "Diffidato", className: "player-status-diff" },
  in_dubbio: { ariaLabel: "In dubbio", className: "player-status-dubbio" },
};

/**
 * Returns {ariaLabel, className, title} for a player worth flagging, or null
 * for disponibile/sconosciuto/no entry - those are silent by design.
 */
export function playerStatusBadge(players, playerName) {
  const entry = players?.[playerName];
  const badge = entry && BADGES[entry.stato];
  if (!badge) return null;
  const detail = [entry.dettaglio, entry.fonte, entry.ultimo_aggiornamento].filter(Boolean).join(" · ");
  return { ...badge, title: detail || undefined };
}

export function formatPlayerStatusUpdatedAt(fetchedAt) {
  if (!fetchedAt) return null;
  const date = new Date(fetchedAt * 1000);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}
