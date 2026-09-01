import { memo } from "react";
import { playerIdKey } from "./auction-state.js";
import { TARGET_PRIORITIES, targetStatus } from "./targets-state.js";
import { TeamBadge } from "./team-badge.jsx";

const PRIORITY_LABELS = { alta: "Alta", media: "Media", bassa: "Bassa" };

/**
 * Compact, read-only glance at Obiettivi for the Asta tab: active targets
 * grouped by priority, plus achieved/lost counts. Full management (add,
 * remove, set priority/price) stays in the dedicated Obiettivi tab - this
 * widget reads the same targets state (via useTargets in the Auction
 * component) without duplicating the editing UI.
 *
 * Wrapped in memo: depends only on targets/players/assigned, so it should
 * not re-render on every bid-form keystroke elsewhere in the Auction view.
 */
export const WatchlistPanel = memo(function WatchlistPanel({ targets, players, assigned, myTeamIndex, openPlayer }) {
  const entries = Object.keys(targets)
    .map((id) => players.find((p) => playerIdKey(p.id) === id))
    .filter(Boolean)
    .map((player) => {
      const taken = assigned[playerIdKey(player.id)];
      return { player, meta: targets[playerIdKey(player.id)], status: targetStatus(taken, myTeamIndex) };
    });

  if (!entries.length) {
    return (
      <p className="watchlist-panel-empty">
        Nessun obiettivo ancora. Usa la stella accanto a un giocatore per aggiungerlo.
      </p>
    );
  }

  const active = entries.filter((entry) => entry.status === "active");
  const achievedCount = entries.filter((entry) => entry.status === "achieved").length;
  const lostCount = entries.filter((entry) => entry.status === "lost").length;

  return (
    <div className="watchlist-panel">
      {(achievedCount > 0 || lostCount > 0) && (
        <p className="watchlist-panel-summary">
          {achievedCount > 0 && <span className="watchlist-chip achieved">{achievedCount} raggiunti</span>}
          {lostCount > 0 && <span className="watchlist-chip lost">{lostCount} persi</span>}
        </p>
      )}
      {active.length === 0 ? (
        <p className="watchlist-panel-empty">Nessun obiettivo attivo al momento.</p>
      ) : (
        TARGET_PRIORITIES.map((priority) => {
          const rows = active.filter((entry) => entry.meta.priority === priority);
          if (!rows.length) return null;
          return (
            <div className="watchlist-priority-group" key={priority}>
              <span className={`watchlist-priority-label watchlist-priority-${priority}`}>
                {PRIORITY_LABELS[priority]}
              </span>
              <ul>
                {rows.map(({ player, meta }) => (
                  <li key={player.id}>
                    <button onClick={() => openPlayer(player)}>
                      <i className={"role " + player.ruolo}>{player.ruolo}</i>
                      <span>
                        <b>{player.nome}</b>
                        <small>
                          <TeamBadge team={player.squadra} size={12} /> {player.squadra}
                        </small>
                      </span>
                      {meta.maxBid != null && <em>{meta.maxBid} cr.</em>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}
    </div>
  );
});
