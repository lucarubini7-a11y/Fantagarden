import { memo, useEffect, useMemo, useState } from "react";
import { playerIdKey } from "./auction-state.js";
import { scoreByUpcomingFixtures } from "./fixture-advisor.js";
import { playerStatusBadge } from "./player-status-client.js";
import { TeamBadge } from "./team-badge.jsx";
import { TargetStar } from "./target-star.jsx";
import { DataTable } from "./data-table.jsx";
import { ROLE_LABELS } from "./role-labels.js";

const LABEL_CLASS = { facile: "good", medio: "caution", duro: "bad" };
const DIFFICULTY_RANK = { facile: 0, medio: 1, duro: 2 };
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

/**
 * Wrapped in memo: this panel only cares about players/teams/assigned/
 * targets/playerStatus, so it should not re-render just because the bid
 * form's price/query state changes elsewhere in the Auction component.
 */
export const FixtureAdvisor = memo(function FixtureAdvisor({
  players,
  teams,
  assigned,
  activeRole,
  defaultFromMatchday = 1,
  serieAMatchdays = 38,
  openPlayer,
  playerStatus,
  targets,
  setTargets,
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

  const rows = useMemo(
    () =>
      scored.map((player) => ({
        player,
        nextOpponents: nextOpponentsFor(teams, player, fromMatchday),
        statusBadge: playerStatusBadge(playerStatus, player.nome),
      })),
    [scored, teams, fromMatchday, playerStatus],
  );

  const columns = useMemo(
    () => [
      {
        id: "nome",
        header: "Nome",
        accessorFn: (row) => row.player.nome,
        cell: ({ row }) => {
          const { player, nextOpponents, statusBadge } = row.original;
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button type="button" className="data-table-name-btn" onClick={() => openPlayer?.(player)}>
                <i className={"role " + player.ruolo}>{player.ruolo}</i>
                <span className="fixture-advisor-name">
                  <span>
                    <b>{player.nome}</b>
                    {statusBadge && (
                      <i
                        className={`player-status-badge ${statusBadge.className}`}
                        role="img"
                        aria-label={statusBadge.ariaLabel}
                        title={statusBadge.title}
                      />
                    )}
                  </span>
                  {nextOpponents && (
                    <span className="fixture-advisor-opponents">
                      {nextOpponents.map((fixture, index) => (
                        <span className="fixture-advisor-opponent" key={index}>
                          {fixture.venue === "CASA" ? "vs" : "@"}
                          <TeamBadge team={fixture.opponent} size={12} /> {fixture.opponent}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </button>
              {targets && setTargets && (
                <TargetStar player={player} targets={targets} setTargets={setTargets} />
              )}
            </div>
          );
        },
      },
      {
        id: "squadra",
        header: "Squadra",
        accessorFn: (row) => row.player.squadra,
        cell: ({ getValue }) => (
          <span className="data-table-team">
            <TeamBadge team={getValue()} size={14} /> {getValue()}
          </span>
        ),
      },
      {
        id: "fvm",
        header: "FVM",
        accessorFn: (row) => row.player.fvm_scaled ?? 0,
        cell: ({ getValue }) => <span className="data-table-num">{getValue()}</span>,
      },
      {
        id: "difficolta",
        header: "Difficoltà",
        accessorFn: (row) => DIFFICULTY_RANK[row.player.fixtureLabel] ?? -1,
        cell: ({ row }) =>
          row.original.player.fixtureLabel ? (
            <i className={`fixture-tag ${LABEL_CLASS[row.original.player.fixtureLabel]}`}>
              {row.original.player.fixtureLabel}
            </i>
          ) : null,
      },
    ],
    [openPlayer, targets, setTargets],
  );

  return (
    <>
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
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.player.id}
        emptyMessage="Nessun giocatore libero per questo ruolo."
      />
    </>
  );
});
