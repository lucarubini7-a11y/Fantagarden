import { memo } from "react";
import { legalMaxBid, playerIdKey, slotsLeft } from "./auction-state.js";
import { AuctionOverview } from "./auction-overview.jsx";
import { PlayerStatusBadge } from "./player-status-badge.jsx";

/**
 * The live scoreboard: my team's KPIs and budget plan, then every team's
 * roster/budget/slots side by side. Everything here is derived straight
 * from the shared auction state (state, overview) - no fetching or local
 * bid logic of its own, that stays in the Auction component so the search
 * bar and bid form keep a single source of truth for "who's selected".
 *
 * Wrapped in memo: typing in the bid price/search box re-renders the whole
 * Auction component, but none of that touches state/overview/players, so
 * this scoreboard would otherwise re-render on every keystroke for nothing.
 */
export const AuctionTracker = memo(function AuctionTracker({
  state,
  setState,
  userTeamIndex,
  activeRules,
  players,
  overview,
  player,
  owner,
  mobileTeamIndex,
  setMobileTeamIndex,
  playerStatus,
  openPlayer,
}) {
  const myTeam = state.teams[userTeamIndex];
  const canSetStartingCredits = state.history.length === 0 && !state.undone?.length;
  const updateStartingCredits = (teamIndex, value) => {
    const credits = Number(value);
    if (!Number.isInteger(credits) || credits < 25) return;
    setState((s) => ({
      ...s,
      teams: s.teams.map((team, index) =>
        index === teamIndex ? { ...team, startingCredits: credits, credits } : team,
      ),
    }));
  };

  return (
    <>
      <section className="auction-summary" aria-label="Stato della mia squadra">
        <div>
          <span>Crediti rimasti</span>
          <strong>{myTeam.credits}</strong>
          <small>per la tua squadra</small>
        </div>
        <div>
          <span>Giocatori presi</span>
          <strong>
            {myTeam.roster.length} /{" "}
            {Object.values(activeRules.rosterSlots).reduce((sum, count) => sum + count, 0)}
          </strong>
          <small>
            {Object.entries(slotsLeft(myTeam, activeRules))
              .map(([role, count]) => `${role}${count}`)
              .join(" ")}{" "}
            posti
          </small>
        </div>
        <div>
          <span>Ultima azione</span>
          <strong>
            {state.history.length
              ? players.find((p) => playerIdKey(p.id) === playerIdKey(state.history.at(-1).playerId))?.nome ||
                "Giocatore"
              : "Nessuna"}
          </strong>
          <small>
            {state.history.length ? `${state.history.at(-1).price} crediti` : "Pronto per iniziare"}
          </small>
        </div>
      </section>
      <AuctionOverview overview={overview} />
      <div className="auction-teams-carousel-nav">
        <button
          type="button"
          onClick={() => setMobileTeamIndex((index) => Math.max(0, index - 1))}
          disabled={mobileTeamIndex === 0}
          aria-label="Squadra precedente"
        >
          ‹
        </button>
        <span>
          <strong>{state.teams[mobileTeamIndex]?.name}</strong>
          <small>
            Squadra {mobileTeamIndex + 1} di {state.teams.length}
          </small>
        </span>
        <button
          type="button"
          onClick={() => setMobileTeamIndex((index) => Math.min(state.teams.length - 1, index + 1))}
          disabled={mobileTeamIndex === state.teams.length - 1}
          aria-label="Squadra successiva"
        >
          ›
        </button>
      </div>
      <div className="auction-teams">
        {state.teams.map((team, i) => {
          const left = slotsLeft(team, activeRules),
            max = legalMaxBid(team, activeRules);
          const isNominating = Boolean(player) && i === owner;
          const isMobileActive = i === mobileTeamIndex;
          return (
            <article
              key={i}
              className={[isNominating ? "nominating" : "", isMobileActive ? "mobile-active" : ""]
                .filter(Boolean)
                .join(" ")}
            >
              <label>
                Nome squadra
                <input
                  aria-label={`Nome squadra ${i + 1}`}
                  value={team.name}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      teams: s.teams.map((t, j) => (j === i ? { ...t, name: e.target.value } : t)),
                    }))
                  }
                />
              </label>
              {canSetStartingCredits ? (
                <label className="starting-credits">
                  Crediti iniziali
                  <input
                    type="number"
                    min="25"
                    step="1"
                    value={team.credits}
                    onChange={(e) => updateStartingCredits(i, e.target.value)}
                  />
                </label>
              ) : (
                <strong>
                  {team.credits}
                  <small> crediti rimasti</small>
                </strong>
              )}
              <p>
                Max bid {max} · P{left.P} D{left.D} C{left.C} A{left.A}
              </p>
              {team.roster.length ? (
                team.roster.map((p) => (
                  <button key={p.id} onClick={() => openPlayer(p)}>
                    <i className={"role " + p.ruolo}>{p.ruolo}</i>
                    {p.nome}
                    <PlayerStatusBadge players={playerStatus} name={p.nome} />
                    <em>{state.assigned[playerIdKey(p.id)]?.price}</em>
                  </button>
                ))
              ) : (
                <span className="empty-roster">Nessun giocatore</span>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
});
