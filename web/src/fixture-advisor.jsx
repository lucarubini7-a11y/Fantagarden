import { useEffect, useState } from "react";
import { playerIdKey } from "./auction-state.js";
import { scoreByUpcomingFixtures } from "./fixture-advisor.js";

const ROLE_LABELS = { P: "Portieri", D: "Difensori", C: "Centrocampisti", A: "Attaccanti" };
const LABEL_CLASS = { facile: "good", medio: "caution", duro: "bad" };
const TOP_COUNT = 8;

/**
 * Per-department targets for the next few matchdays: blends fixture
 * difficulty (from per-matchday projections already in the dataset) with
 * overall quality, so a cheaper player with a soft run can outrank a
 * pricier one with a harder one.
 */
const nextOpponentsFor = (teams, player, fromMatchday) => {
  const team = teams?.find((t) => t.squadra === player.squadra);
  const fixtures = team?.fixtures?.filter((f) => f.matchday >= fromMatchday).slice(0, 3);
  return fixtures?.length ? fixtures : null;
};

export function FixtureAdvisor({
  players,
  teams,
  assigned,
  activeRole,
  defaultFromMatchday = 1,
  serieAMatchdays = 38,
  openPlayer,
}) {
  const [role, setRole] = useState(() => activeRole || "P");
  const [fromMatchday, setFromMatchday] = useState(defaultFromMatchday);
  const [windowSize, setWindowSize] = useState(5);

  useEffect(() => {
    if (activeRole) setRole(activeRole);
  }, [activeRole]);

  const candidates = players.filter(
    (p) => p.ruolo === role && !assigned[playerIdKey(p.id)],
  );
  const scored = scoreByUpcomingFixtures(candidates, { fromMatchday, windowSize })
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, TOP_COUNT);

  return (
    <section className="fixture-advisor" aria-label="Consigli per reparto">
      <div className="fixture-advisor-header">
        <h3>Consigli per reparto</h3>
        <div className="fixture-advisor-controls">
          <label>
            Ruolo
            <select value={role} onChange={(e) => setRole(e.target.value)} disabled={Boolean(activeRole)}>
              {Object.keys(ROLE_LABELS).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <label>
            A partire dalla giornata
            <input
              type="number"
              min={1}
              max={serieAMatchdays}
              value={fromMatchday}
              onChange={(e) => setFromMatchday(Math.max(1, Math.min(serieAMatchdays, Number(e.target.value) || 1)))}
            />
          </label>
          <label>
            Prossime N giornate
            <input
              type="number"
              min={3}
              max={10}
              value={windowSize}
              onChange={(e) => setWindowSize(Math.max(3, Math.min(10, Number(e.target.value) || 5)))}
            />
          </label>
        </div>
      </div>
      {scored.length === 0 ? (
        <p className="fixture-advisor-empty">Nessun giocatore libero per questo ruolo.</p>
      ) : (
        <div className="fixture-advisor-list">
          {scored.map((player) => {
            const nextOpponents = nextOpponentsFor(teams, player, fromMatchday);
            return (
              <button
                key={player.id}
                className="fixture-advisor-row"
                onClick={() => openPlayer?.(player)}
              >
                <span>
                  <b>{player.nome}</b>
                  <small>
                    {player.squadra}
                    {nextOpponents && (
                      <>
                        {" · "}
                        {nextOpponents
                          .map((f) => `${f.venue === "CASA" ? "vs" : "@"} ${f.opponent}`)
                          .join(" · ")}
                      </>
                    )}
                  </small>
                </span>
                <em>{player.fvm_scaled}</em>
                {player.fixtureLabel && (
                  <i className={`fixture-tag ${LABEL_CLASS[player.fixtureLabel]}`}>
                    {player.fixtureLabel}
                  </i>
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
