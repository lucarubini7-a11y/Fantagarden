import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import RandomAuctionView from "./random-auction.jsx";
import { WIDGET_REGISTRY } from "./widget-registry.js";
import { DashboardGrid } from "./dashboard-grid.jsx";
import { DataTable } from "./data-table.jsx";
import { PlayerStatusBadge } from "./player-status-badge.jsx";
import { TargetStar } from "./target-star.jsx";
import { fetchPlayerStatus, formatPlayerStatusUpdatedAt } from "./player-status-client.js";
import { TeamBadge } from "./team-badge.jsx";
import { LeagueSettings } from "./league-settings.jsx";
import { normalizeRules } from "./league-rules.js";
import { activeNominationRole } from "./auction-nomination.js";
import {
  emptyAuction,
  isValidBid,
  legalMaxBid,
  playerIdKey,
  rehydrateAuction,
  resolveUserTeamIndex,
  serializeAuction,
  slotsLeft,
} from "./auction-state.js";
import {
  TARGET_PRIORITIES,
  addTarget,
  isTargeted,
  removeTarget,
  setTargetMaxBid,
  setTargetNote,
  setTargetPriority,
  targetStatus,
  useTargets,
} from "./targets-state.js";
import {
  SESSION_SCHEMA_VERSION,
  createAutosave,
  createEnvelope,
  exportEnvelope,
  formatSavedAt,
  loadActiveEnvelope,
  parseImportedEnvelope,
  saveEnvelope,
  startNewSession,
} from "./session-store.js";
import {
  apiUrl,
  auctionDatasetPath,
  loadDatasetUrl,
  rulesFor,
  seasonSimulationPath,
} from "./profile-client.js";
import { createRoleValuation, sourceFvm } from "./player-valuation.js";
import { ROLE_LABELS } from "./role-labels.js";

const formatTier = (tier) =>
  tier ? tier.replaceAll("_", " ") : "NON CLASSIFICATO";
const statusClass = (status) =>
  ({ TITOLARE: "good", BALLOTTAGGIO: "caution", RISERVA: "muted" })[status] ||
  "muted";

const RECOMMENDATION_LABELS = {
  STRONG_BUY: "Compra",
  BID: "Conviene",
  VALUE_ONLY: "Solo al prezzo giusto",
  PASS: "Lascia andare",
  INELIGIBLE: "Non acquistabile",
};

function App() {
  const [data, setData] = useState(null);
  const [season, setSeason] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState("");
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationStatus, setSimulationStatus] = useState("");
  const [playerStatus, setPlayerStatus] = useState({ fetchedAt: null, players: {} });
  const [isPlayerStatusLoading, setIsPlayerStatusLoading] = useState(false);
  const apiBase =
    import.meta.env.VITE_LOCAL_API_BASE || "http://127.0.0.1:8000";
  const [view, setView] = useState("overview");
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [viewHistory, setViewHistory] = useState([
    { view: "overview", player: null, team: null },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);
  useEffect(() => {
    fetch(apiUrl("/api/default-profile", apiBase))
      .then((response) => (response.ok ? response.json() : null))
      .then(setProfile)
      .catch(() => setProfile(null));
  }, [apiBase]);
  useEffect(() => {
    if (!profile) return;
    const datasetPath = auctionDatasetPath(profile);
    loadDatasetUrl(apiUrl(`/api/datasets/${datasetPath}`, apiBase), { profile })
      .then((nextData) => {
        setData(nextData);
        setSelectedTeam((team) => team || nextData.teams[0]?.squadra || null);
      })
      .catch(() => setData(null));
    fetch(apiUrl(`/api/datasets/${seasonSimulationPath(profile)}`, apiBase))
      .then((response) => (response.ok ? response.json() : null))
      .then(setSeason)
      .catch(() => setSeason(null));
  }, [apiBase, profile]);
  const refreshPlayerStatus = (forceRefresh = false) => {
    setIsPlayerStatusLoading(true);
    fetchPlayerStatus(apiBase, { forceRefresh }).then((result) => {
      setPlayerStatus(result);
      setIsPlayerStatusLoading(false);
    });
  };
  useEffect(() => {
    if (!data) return;
    refreshPlayerStatus(false);
  }, [data, apiBase]);
  useEffect(() => {
    const initialRoute = { view: "overview", player: null, team: null };
    window.history.replaceState(
      { fantaRoute: initialRoute, fantaIndex: 0 },
      "",
    );
    const restoreRoute = (event) => {
      const route = event.state?.fantaRoute;
      if (!route) return;
      setHistoryIndex(event.state.fantaIndex ?? 0);
      applyRoute(route);
    };
    window.addEventListener("popstate", restoreRoute);
    return () => window.removeEventListener("popstate", restoreRoute);
  }, []);
  const applyRoute = (route) => {
    setView(route.view);
    setSelectedPlayer(route.player);
    setSelectedTeam(route.team);
  };
  const navigate = (
    nextView,
    { player = selectedPlayer, team = selectedTeam } = {},
  ) => {
    const route = { view: nextView, player, team };
    setViewHistory((routes) => [...routes.slice(0, historyIndex + 1), route]);
    setHistoryIndex((index) => index + 1);
    window.history.pushState(
      { fantaRoute: route, fantaIndex: historyIndex + 1 },
      "",
    );
    applyRoute(route);
  };
  const moveThroughHistory = (direction) => {
    const nextIndex = historyIndex + direction;
    if (!viewHistory[nextIndex]) return;
    window.history.go(direction);
  };
  const openPlayer = (player) => navigate("players", { player });
  const activeRules = rulesFor(profile, data || {});
  const activeProfileId =
    profile?.profile_id || data?.meta?.profile?.profile_id || "default";
  const updateProfile = async (nextProfile, generate = false) => {
    setProfile(nextProfile);
    setProfileError("");
    if (!generate) return;
    try {
      const response = await fetch(`${apiBase}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: nextProfile }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.dataset_path)
        throw new Error(
          payload.error?.message || "Generazione non completata.",
        );
      setData(
        await loadDatasetUrl(
          apiUrl(`/api/datasets/${payload.dataset_path}`, apiBase),
          { profile: nextProfile },
        ),
      );
      setSeason(null);
      navigate("overview");
    } catch (error) {
      setProfileError(
        error instanceof Error
          ? error.message
          : "Impossibile generare il dataset del profilo.",
      );
      throw error;
    }
  };
  const regenerateData = async () => {
    if (!profile || isGenerating) return;
    setIsGenerating(true);
    setGenerationStatus("Rigenerazione in corso...");
    try {
      await updateProfile(profile, true);
      setGenerationStatus("Dati rigenerati.");
    } catch (error) {
      setGenerationStatus("Rigenerazione non riuscita.");
    } finally {
      setIsGenerating(false);
    }
  };
  const rerunSimulation = async () => {
    if (isSimulating) return;
    setIsSimulating(true);
    setSimulationStatus("Simulazione in corso...");
    try {
      const response = await fetch(`${apiBase}/api/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, iterations: 1000, seed: 202627 }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Simulazione non completata.");
      setSeason(result);
      setSimulationStatus("Simulazione aggiornata.");
    } catch (error) {
      setSimulationStatus("Simulazione non riuscita.");
    } finally {
      setIsSimulating(false);
    }
  };
  const nav = [
    ["overview", "Sintesi"],
    ["players", "Giocatori"],
    ["teams", "Squadre"],
    ["setpieces", "Piazzati"],
    ["simulation", "Simulazione"],
    ["targets", "Obiettivi"],
    ["auction", "Asta live"],
    ["settings", "Impostazioni"],
  ];
  if (!profile)
    return <main className="loading">Caricamento profilo locale...</main>;
  if (!data)
    return (
      <main className="app-shell">
        <section className="data-view">
          <div className="view-heading">
            <span className="eyebrow">CONFIGURAZIONE INIZIALE</span>
            <h1>Genera il tuo dataset</h1>
            <p>Carica il calendario della tua lega nelle Impostazioni e genera i dati per iniziare.</p>
          </div>
          <LeagueSettings
            initialProfile={profile}
            leagueCalendar={null}
            apiBase={apiBase}
            onSave={(nextProfile) => updateProfile(nextProfile)}
            onGenerate={(nextProfile) => updateProfile(nextProfile, true)}
          />
          {profileError && <p className="profile-error" role="alert">{profileError}</p>}
        </section>
      </main>
    );
  return (
    <main className="app-shell">
      <header className="app-header">
        <button className="brand" onClick={() => navigate("overview")}>
          <span>{profile?.season?.season || "FANTACALCIO"}</span>
          <strong>Control room</strong>
        </button>
        <div
          className="history-controls"
          aria-label="Cronologia di navigazione"
        >
          <button
            onClick={() => moveThroughHistory(-1)}
            disabled={historyIndex === 0}
            aria-label="Vista precedente"
            title="Indietro"
          >
            &larr;
          </button>
          <button
            onClick={() => moveThroughHistory(1)}
            disabled={historyIndex === viewHistory.length - 1}
            aria-label="Vista successiva"
            title="Avanti"
          >
            &rarr;
          </button>
        </div>
        <nav>
          {nav.map(([id, label]) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              onClick={() => navigate(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="data-status">
          <i />
          Dati aggiornati
          <br />
          <small>
            {generationStatus || data.meta?.generato_il?.slice(0, 10) || "profilo locale"}
          </small>
          <button
            className="regenerate-data"
            onClick={regenerateData}
            disabled={!profile || isGenerating}
          >
            {isGenerating ? "Rigenerazione..." : "Rigenera dati"}
          </button>
        </div>
      </header>
      {view === "overview" && (
        <Overview
          data={data}
          openPlayer={openPlayer}
          openTeam={(team) => navigate("teams", { team })}
        />
      )}
      {view === "players" && (
        <PlayersView
          data={data}
          rules={activeRules}
          selected={selectedPlayer}
          setSelected={setSelectedPlayer}
        />
      )}
      {view === "teams" && (
        <TeamsView
          data={data}
          selectedTeam={selectedTeam}
          setSelectedTeam={setSelectedTeam}
          openPlayer={openPlayer}
        />
      )}
      {view === "setpieces" && (
        <SetPiecesView data={data} openPlayer={openPlayer} />
      )}
      {view === "simulation" && (
          <SeasonView
            season={season}
            data={data}
            openPlayer={openPlayer}
            rules={activeRules}
            profileId={activeProfileId}
            onRerun={rerunSimulation}
            isSimulating={isSimulating}
            simulationStatus={simulationStatus}
        />
      )}
      {view === "targets" && (
        <TargetsView
          data={data}
          rules={activeRules}
          profileId={activeProfileId}
          openPlayer={openPlayer}
        />
      )}
      {view === "auction" && (
        <Auction
          data={data}
          openPlayer={openPlayer}
          rules={activeRules}
          profileId={activeProfileId}
          apiBase={apiBase}
          playerStatus={playerStatus}
          isPlayerStatusLoading={isPlayerStatusLoading}
          onRefreshPlayerStatus={refreshPlayerStatus}
        />
      )}
      {view === "settings" && (
        <>
          <LeagueSettings
            initialProfile={profile}
            leagueCalendar={data.calendario_lega || data.calendar}
            apiBase={apiBase}
            onSave={(nextProfile) => updateProfile(nextProfile)}
            onGenerate={(nextProfile) => updateProfile(nextProfile, true)}
          />
          {profileError && (
            <p className="profile-error" role="alert">
              {profileError}
            </p>
          )}
        </>
      )}
    </main>
  );
}

function SeasonView({ season, data, openPlayer, rules, profileId, onRerun, isSimulating, simulationStatus }) {
  const [mode, setMode] = useState("report");
  return (
    <>
      <div
        className="simulation-mode"
        role="group"
        aria-label="Modalita simulazione"
      >
        <button
          className={mode === "report" ? "active" : ""}
          onClick={() => setMode("report")}
          aria-pressed={mode === "report"}
        >
          Report rose
        </button>
        <button
          className={mode === "auction" ? "active" : ""}
          onClick={() => setMode("auction")}
          aria-pressed={mode === "auction"}
        >
          Asta casuale
        </button>
      </div>
      {mode === "auction" ? (
        <RandomAuctionView data={data} rules={rules} profileId={profileId} />
      ) : (
        <SeasonReport season={season} data={data} openPlayer={openPlayer} onRerun={onRerun} isSimulating={isSimulating} simulationStatus={simulationStatus} />
      )}
    </>
  );
}

function buildRosterColumns(openPlayer) {
  return [
    {
      accessorKey: "ruolo",
      header: "Ruolo",
      cell: (info) => <i className={"role " + info.getValue()}>{info.getValue()}</i>,
    },
    {
      accessorKey: "nome",
      header: "Nome",
      cell: (info) => {
        const player = info.row.original;
        return (
          <button className="data-table-name-btn" onClick={() => openPlayer(player)}>
            <b>{player.nome}</b>
            <span className="data-table-team">
              <TeamBadge team={player.squadra} size={14} /> {player.squadra} · {formatTier(player.guida_asta_fascia)}
            </span>
          </button>
        );
      },
    },
    {
      accessorKey: "fvm_scaled",
      header: "FVM",
      cell: (info) => <span className="data-table-num">{info.getValue()}</span>,
    },
  ];
}

function SeasonReport({ season, data, openPlayer, onRerun, isSimulating, simulationStatus }) {
  const rosterColumns = useMemo(() => buildRosterColumns(openPlayer), [openPlayer]);
  const [selected, setSelected] = useState(null);
  if (!data.calendario_lega)
    return (
      <section className="data-view">
        <div className="view-heading">
          <span className="eyebrow">MONTE CARLO OFFLINE</span>
          <h1>Calendario della lega richiesto</h1>
          <p>Puoi usare dashboard, proiezioni e asta. Carica il calendario della lega nelle Impostazioni per simulare la stagione.</p>
        </div>
      </section>
    );
  if (!season)
    return (
      <section className="data-view">
        <div className="view-heading">
          <span className="eyebrow">MONTE CARLO OFFLINE</span>
          <h1>Simulazione non generata</h1>
          <p>Avvia una simulazione per costruire il report pre-asta sulle rose esempio.</p>
          <SimulationRunButton onRerun={onRerun} isSimulating={isSimulating} status={simulationStatus} />
        </div>
      </section>
    );
  const rows = Object.entries(season.teams).sort(
    ([, a], [, b]) => b.expected_utility - a.expected_utility,
  );
  const activeTeam = selected || rows[0][0];
  const roster = (season.rosters[activeTeam] || [])
    .map((id) => data.players.find((p) => p.id === id))
    .filter(Boolean)
    .sort(
      (a, b) => a.ruolo.localeCompare(b.ruolo) || b.fvm_scaled - a.fvm_scaled,
    );
  const scenario = season.scenarios?.[activeTeam];
  return (
    <section className="data-view">
      <div className="view-heading">
        <span className="eyebrow">MONTE CARLO OFFLINE</span>
        <h1>Esiti delle rose esempio</h1>
        <p>
          {season.iterations.toLocaleString("it-IT")} stagioni simulate · seed{" "}
          {season.diagnostics.seed} · {data.calendario_lega?.matchdays?.length || "n/d"} giornate di lega
        </p>
        <SimulationRunButton onRerun={onRerun} isSimulating={isSimulating} status={simulationStatus} />
      </div>
      <section className="panel simulation-report">
        <div className="sim-header">
          <span>Rosa esempio</span>
          <span>Utilità attesa</span>
          <span>Top 3</span>
          <span>Punti attesi</span>
          <span>Punteggio stagionale</span>
        </div>
        {rows.map(([team, result], index) => (
          <button
            className={activeTeam === team ? "selected" : ""}
            onClick={() => setSelected(team)}
            key={team}
          >
            <b>{index + 1}</b>
            <strong>{team}</strong>
            <span className={result.expected_utility >= 0 ? "up" : "down"}>
              {result.expected_utility >= 0 ? "+" : ""}
              {result.expected_utility.toFixed(0)} EUR
            </span>
            <span>{(result.top3_probability * 100).toFixed(1)}%</span>
            <span>{result.expected_points.toFixed(1)}</span>
            <span>
              {result.expected_score.toFixed(0)}{" "}
              <small>
                P05 {result.score_p05.toFixed(0)} · P95{" "}
                {result.score_p95.toFixed(0)}
              </small>
            </span>
          </button>
        ))}
      </section>
      <section className="scenario-grid">
        <div className="panel simulated-roster">
          <div className="panel-title">
            <div>
              <span className="eyebrow">ROSA SELEZIONATA</span>
              <h2>{activeTeam}</h2>
            </div>
            <span className="count">{roster.length} giocatori</span>
          </div>
          <DataTable
            columns={rosterColumns}
            data={roster}
            getRowId={(player) => player.id}
            filterPlaceholder="Cerca in rosa..."
            emptyMessage="Nessun giocatore in questa rosa."
          />
        </div>
        <div className="panel extremes">
          <span className="eyebrow">ESTREMI OSSERVATI</span>
          <h2>Range della stessa rosa</h2>
          <div className="best">
            <span>Migliore stagione estratta</span>
            <strong>{scenario?.best_score}</strong>
            <p>
              {scenario?.best_points} punti · {scenario?.best_rank}° posto
            </p>
          </div>
          <div className="worst">
            <span>Peggiore stagione estratta</span>
            <strong>{scenario?.worst_score}</strong>
            <p>
              {scenario?.worst_points} punti · {scenario?.worst_rank}° posto
            </p>
          </div>
          <p className="micro">
            Sono gli estremi realizzati nelle{" "}
            {season.iterations.toLocaleString("it-IT")} simulazioni: mostrano la
            variabilità, non una previsione puntuale.
          </p>
        </div>
      </section>
      <section className="panel simulation-note">
        <b>Come leggere questo report</b>
        <p>
          Le rose sono generate automaticamente con snake draft bilanciato sui
          valori FVM. Ora puoi ispezionare ogni rosa e capire quali profili
          producono i risultati migliori e peggiori; non rappresentano ancora le
          rose della tua lega reale.
        </p>
      </section>
    </section>
  );
}

function SimulationRunButton({ onRerun, isSimulating, status }) {
  return (
    <div className="simulation-run">
      <button onClick={onRerun} disabled={isSimulating}>
        {isSimulating ? "Simulazione in corso..." : "Riesegui Monte Carlo"}
      </button>
      {status && <small role="status">{status}</small>}
    </div>
  );
}

function Overview({ data, openPlayer, openTeam }) {
  const roleCounts = Object.keys(ROLE_LABELS).map((role) => ({
    role,
    count: data.players.filter((p) => p.ruolo === role).length,
  }));
  const top = data.players
    .filter((p) =>
      ["SUPER TOP", "TOP", "SEMITOP"].includes(formatTier(p.guida_asta_fascia)),
    )
    .sort((a, b) => b.fvm_scaled - a.fvm_scaled)
    .slice(0, 8);
  const injury = data.players.filter(
    (p) => p.guida_asta_fascia === "INFORTUNATO",
  );
  return (
    <>
      <section className="hero">
        <div>
          <span className="eyebrow">DATABASE OFFLINE</span>
          <h1>
            Tutto il tuo fanta,
            <br />
            in una sola vista.
          </h1>
          <p>
            Proiezioni, storico, guide editoriali, calendario e gerarchie sui
            piazzati. Nessuna connessione richiesta durante l’asta.
          </p>
        </div>
        <div className="hero-card">
          <span>Copertura dati</span>
          <strong>
            {data.players.length}
            <small> giocatori</small>
          </strong>
          <p>{data.teams.length} squadre Serie A · {data.calendario_serie_a?.length / 10 || "n/d"} giornate · {data.set_pieces.length} gerarchie piazzati</p>
        </div>
      </section>
      <section className="metric-grid">
        {roleCounts.map((item) => (
          <button
            className="metric"
            key={item.role}
            onClick={() =>
              openPlayer(data.players.find((p) => p.ruolo === item.role))
            }
          >
            <span className={"role " + item.role}>{item.role}</span>
            <strong>{item.count}</strong>
            <small>{ROLE_LABELS[item.role]}</small>
          </button>
        ))}
        <div className="metric accent">
          <span>Fasce SOS</span>
          <strong>
            {data.players.filter((p) => p.guida_asta_fascia).length}
          </strong>
          <small>profili classificati</small>
        </div>
      </section>
      <section className="split-layout">
        <div className="panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">PRIME SCELTE</span>
              <h2>Valore e proiezione</h2>
            </div>
            <button onClick={() => openPlayer(top[0])}>
              Tutti i giocatori
            </button>
          </div>
          <div className="rank-list">
            {top.map((player, index) => (
              <button key={player.id} onClick={() => openPlayer(player)}>
                <b>{String(index + 1).padStart(2, "0")}</b>
                <span className={"role " + player.ruolo}>{player.ruolo}</span>
                <div>
                  <strong>{player.nome}</strong>
                  <small>
                    <TeamBadge team={player.squadra} size={14} /> {player.squadra} · {formatTier(player.guida_asta_fascia)}
                  </small>
                </div>
                <em>{player.fvm_scaled}</em>
              </button>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">DA MONITORARE</span>
              <h2>Infortunati</h2>
            </div>
            <span className="count">{injury.length}</span>
          </div>
          <div className="watch-list">
            {injury.length ? (
              injury.map((player) => (
                <button key={player.id} onClick={() => openPlayer(player)}>
                  <span className={"role " + player.ruolo}>{player.ruolo}</span>
                  <div>
                    <strong>{player.nome}</strong>
                    <small>
                      <TeamBadge team={player.squadra} size={14} /> {player.squadra}
                    </small>
                  </div>
                  <span className="status muted">RECUPERO</span>
                </button>
              ))
            ) : (
              <p>Nessun infortunato classificato.</p>
            )}
          </div>
        </div>
      </section>
      <section className="panel team-directory">
        <div className="panel-title">
          <div>
            <span className="eyebrow">SERIE A</span>
            <h2>Esplora le squadre</h2>
          </div>
          <button onClick={() => openTeam(data.teams[0]?.squadra)}>Calendari e rose</button>
        </div>
        <div>
          {data.teams.map((team) => (
            <button key={team.squadra} onClick={() => openTeam(team.squadra)}>
              <strong>
                <TeamBadge team={team.squadra} size={20} /> {team.squadra}
              </strong>
              <small>
                ATT {team.rating_att}/10 · DIF {team.rating_dif}/10
              </small>
              {team.coppa_europea && <span>{team.coppa_europea}</span>}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

function PlayersView({ data, rules, selected, setSelected }) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("TUTTI");
  const [team, setTeam] = useState("TUTTE");
  const valuation = createRoleValuation(data.players, rules);
  const rows = data.players
    .filter(
      (p) =>
        (role === "TUTTI" || p.ruolo === role) &&
        (team === "TUTTE" || p.squadra === team) &&
        p.nome.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => valuation.normalizedFvm(b) - valuation.normalizedFvm(a));
  const player = selected || rows[0];
  return (
    <section className="data-view">
      <div className="view-heading">
        <span className="eyebrow">DATABASE GIOCATORI</span>
        <h1>Profili, storico e proiezioni</h1>
      </div>
      <div className="filters">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca un giocatore"
        />
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option>TUTTI</option>
          {Object.keys(ROLE_LABELS).map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <select value={team} onChange={(e) => setTeam(e.target.value)}>
          <option>TUTTE</option>
          {data.teams.map((t) => (
            <option key={t.squadra}>{t.squadra}</option>
          ))}
        </select>
        <span>{rows.length} risultati</span>
      </div>
      <div className="player-layout">
        <div className="player-table">
          <div className="table-head">
            <span>Giocatore</span>
            <span>Disponibilita</span>
            <span>Valore ruolo</span>
            <span>Proiezione FV</span>
          </div>
          {rows.map((p) => (
            <button
              className={player?.id === p.id ? "selected" : ""}
              key={p.id}
              onClick={() => setSelected(p)}
            >
              <span>
                <i className={"role " + p.ruolo}>{p.ruolo}</i>
                <b>{p.nome}</b>
                <small>
                  <TeamBadge team={p.squadra} size={14} /> {p.squadra} · {formatTier(p.guida_asta_fascia)}
                </small>
              </span>
              <span className={"status " + statusClass(p.disponibilita.status)}>
                {p.disponibilita.status.replace("_", " ")}
              </span>
              <strong>{valuation.normalizedFvm(p).toFixed(1)}</strong>
              <span>{p.proiezione.fantavoto.toFixed(2)}</span>
            </button>
          ))}
        </div>
        {player && (
          <PlayerDetail player={player} valuation={valuation} />
        )}
      </div>
    </section>
  );
}

function PlayerDetail({ player, valuation }) {
  const history = Object.entries(player.storico);
  const outliers = valuation.outliersFor(player);
  return (
    <aside className="player-detail">
      <div className="detail-top">
        <span className={"role " + player.ruolo}>{player.ruolo}</span>
        <span className="tier">{formatTier(player.guida_asta_fascia)}</span>
      </div>
      <h2>{player.nome}</h2>
      <p>
        <TeamBadge team={player.squadra} size={16} /> {player.squadra} · Mantra {player.ruoli_mantra || "n/d"}
      </p>
      <div className="projection">
        <div>
          <span>FVM fonte</span>
          <b>{sourceFvm(player).toFixed(2)}</b>
        </div>
        <div>
          <span>Valore ruolo</span>
          <b>{valuation.normalizedFvm(player).toFixed(2)}</b>
        </div>
        <div>
          <span>Prob. voto</span>
          <b>{Math.round(player.proiezione.p_gioca * 100)}%</b>
        </div>
        <div>
          <span>Fanta voto</span>
          <b>{player.proiezione.fantavoto.toFixed(2)}</b>
        </div>
      </div>
      <p className="valuation-source-note">
        FVM fonte: colonna FVM del listone Fantacalcio su base 1000. Il valore
        ruolo lo normalizza sul budget configurato per il reparto.
      </p>
      {outliers.length > 0 && (
        <div className="valuation-warning" role="note">
          <b>Valore da verificare</b>
          {outliers.map((outlier) => (
            <span key={outlier.code}>{outlier.label}</span>
          ))}
        </div>
      )}
      <div className="quote-row">
        <span>
          Qt. attuale <b>{player.quotazioni.attuale}</b>
        </span>
        <span>
          Iniziale <b>{player.quotazioni.iniziale}</b>
        </span>
        <span className={player.quotazioni.differenza >= 0 ? "up" : "down"}>
          {player.quotazioni.differenza >= 0 ? "+" : ""}
          {player.quotazioni.differenza}
        </span>
      </div>
      <h3>Storico</h3>
      <div className="history">
        {history.length ? (
          history.map(([season, stat]) => (
            <div key={season}>
              <b>{season}</b>
              <span>
                PV {stat.Pv} · MV {stat.Mv ?? "—"} · FM {stat.Fm ?? "—"}
              </span>
              <small>
                G {stat.Gf} · A {stat.Ass} · Amm {stat.Amm}
              </small>
            </div>
          ))
        ) : (
          <p>Nessuno storico nel listone.</p>
        )}
      </div>
      <div className="note">
        <b>{player.disponibilita.status.replace("_", " ")}</b>
        <p>{player.disponibilita.nota || "Stima ricavata dallo storico."}</p>
      </div>
    </aside>
  );
}

const PRIORITY_LABELS = { alta: "Alta", media: "Media", bassa: "Bassa" };
const PRIORITY_RANK = { alta: 0, media: 1, bassa: 2 };

function targetPlayerCell(openPlayer, valuation) {
  return (info) => {
    const player = info.row.original.player;
    return (
      <button className="data-table-name-btn" onClick={() => openPlayer(player)}>
        <i className={"role " + player.ruolo}>{player.ruolo}</i>
        <span>
          <b>{player.nome}</b>
          <span className="data-table-team">
            <TeamBadge team={player.squadra} size={14} /> {player.squadra} · {formatTier(player.guida_asta_fascia)}
          </span>
        </span>
        {valuation && <em className="data-table-num">{valuation.normalizedFvm(player).toFixed(1)}</em>}
      </button>
    );
  };
}

function buildActiveTargetColumns({ openPlayer, setTargets, valuation }) {
  return [
    {
      id: "player",
      accessorFn: (entry) => entry.player.nome,
      header: "Giocatore",
      cell: targetPlayerCell(openPlayer, valuation),
    },
    {
      id: "priority",
      accessorFn: (entry) => entry.meta.priority,
      header: "Priorità",
      sortingFn: (a, b) => PRIORITY_RANK[a.original.meta.priority] - PRIORITY_RANK[b.original.meta.priority],
      cell: (info) => {
        const { player, meta } = info.row.original;
        return (
          <select
            value={meta.priority}
            onChange={(e) => setTargets((current) => setTargetPriority(current, player.id, e.target.value))}
          >
            {TARGET_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABELS[priority]}
              </option>
            ))}
          </select>
        );
      },
    },
    {
      id: "maxBid",
      accessorFn: (entry) => entry.meta.maxBid ?? -1,
      header: "Prezzo Max",
      cell: (info) => {
        const { player, meta } = info.row.original;
        return (
          <input
            type="number"
            min="1"
            inputMode="numeric"
            value={meta.maxBid ?? ""}
            onChange={(e) => setTargets((current) => setTargetMaxBid(current, player.id, e.target.value))}
            placeholder="cr."
          />
        );
      },
    },
    {
      id: "note",
      accessorFn: (entry) => entry.meta.note,
      header: "Nota",
      enableSorting: false,
      cell: (info) => {
        const { player, meta } = info.row.original;
        return (
          <input
            value={meta.note}
            onChange={(e) => setTargets((current) => setTargetNote(current, player.id, e.target.value))}
            placeholder="es. solo se libero il ruolo"
          />
        );
      },
    },
    {
      id: "status",
      header: "Stato",
      enableSorting: false,
      cell: (info) => {
        const { player } = info.row.original;
        return (
          <div className="target-status-cell">
            <span className="target-status free">Libero</span>
            <button
              className="target-remove"
              onClick={() => setTargets((current) => removeTarget(current, player.id))}
              aria-label={`Rimuovi ${player.nome} dagli obiettivi`}
            >
              Rimuovi
            </button>
          </div>
        );
      },
    },
  ];
}

function buildTargetHistoryColumns({ openPlayer, valuation, resolveTakenByName }) {
  return [
    {
      id: "player",
      accessorFn: (entry) => entry.player.nome,
      header: "Giocatore",
      cell: targetPlayerCell(openPlayer, valuation),
    },
    {
      id: "esito",
      header: "Esito",
      enableSorting: false,
      cell: (info) => {
        const { status, taken } = info.row.original;
        return status === "achieved" ? (
          <span className="target-status achieved">
            Preso da te{taken?.price != null ? ` · ${taken.price} cr.` : ""}
          </span>
        ) : (
          <span className="target-status lost">
            Perso: preso da {resolveTakenByName(taken) || "un'altra squadra"}
            {taken?.price != null ? ` · ${taken.price} cr.` : ""}
          </span>
        );
      },
    },
  ];
}

function TargetsView({ data, rules, profileId, openPlayer }) {
  const valuation = createRoleValuation(data.players, rules);
  const myTeamIndex = resolveUserTeamIndex(rules);
  const [targets, setTargets] = useTargets(profileId, data.players);
  const [auctionState] = useState(() => {
    const { envelope } = loadActiveEnvelope(profileId);
    return envelope ? rehydrateAuction(envelope.state.auction, data.players, rules) : null;
  });
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("TUTTI");
  const suggestions =
    query.length >= 2
      ? data.players
          .filter(
            (p) =>
              !isTargeted(targets, p.id) &&
              (role === "TUTTI" || p.ruolo === role) &&
              p.nome.toLowerCase().includes(query.toLowerCase()),
          )
          .slice(0, 8)
      : [];
  const withStatus = Object.keys(targets)
    .map((id) => data.players.find((p) => playerIdKey(p.id) === id))
    .filter(Boolean)
    .map((player) => {
      const taken = auctionState?.assigned[playerIdKey(player.id)];
      return { player, meta: targets[playerIdKey(player.id)], taken, status: targetStatus(taken, myTeamIndex) };
    });
  const activeTargets = withStatus.filter((entry) => entry.status === "active");
  const achievedTargets = withStatus.filter((entry) => entry.status === "achieved");
  const lostTargets = withStatus.filter((entry) => entry.status === "lost");
  const add = (player) => {
    setTargets((current) => addTarget(current, player.id));
    setQuery("");
  };
  const activeColumns = useMemo(
    () => buildActiveTargetColumns({ openPlayer, setTargets, valuation }),
    [openPlayer, setTargets, valuation],
  );
  const historyColumns = useMemo(
    () => buildTargetHistoryColumns({ openPlayer, valuation, resolveTakenByName: (taken) => auctionState?.teams[taken?.owner]?.name }),
    [openPlayer, valuation, auctionState],
  );
  return (
    <section className="data-view targets">
      <div className="view-heading">
        <span className="eyebrow">PREPARAZIONE ASTA</span>
        <h1>I tuoi obiettivi</h1>
        <p>
          Segna i giocatori da puntare, il prezzo massimo che vuoi pagare e
          una nota personale. La lista resta salvata solo su questo
          dispositivo.
        </p>
      </div>
      <div className="filters">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca un giocatore da aggiungere"
        />
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option>TUTTI</option>
          {Object.keys(ROLE_LABELS).map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <span>
          {activeTargets.length} {activeTargets.length === 1 ? "obiettivo attivo" : "obiettivi attivi"}
        </span>
      </div>
      {suggestions.length > 0 && (
        <div className="target-suggestions">
          {suggestions.map((p) => (
            <button key={p.id} onClick={() => add(p)}>
              <i className={"role " + p.ruolo}>{p.ruolo}</i>
              <b>{p.nome}</b>
              <small>
                <TeamBadge team={p.squadra} size={14} /> {p.squadra} · {formatTier(p.guida_asta_fascia)}
              </small>
              <em>+ Aggiungi</em>
            </button>
          ))}
        </div>
      )}
      <DataTable
        columns={activeColumns}
        data={activeTargets}
        getRowId={(entry) => entry.player.id}
        filterPlaceholder="Cerca tra i tuoi obiettivi..."
        emptyMessage="Nessun obiettivo attivo. Cerca un giocatore qui sopra per aggiungerlo alla lista."
      />
      {achievedTargets.length > 0 && (
        <details className="target-history">
          <summary>Raggiunti ({achievedTargets.length})</summary>
          <DataTable columns={historyColumns} data={achievedTargets} getRowId={(entry) => entry.player.id} />
        </details>
      )}
      {lostTargets.length > 0 && (
        <details className="target-history">
          <summary>Persi ({lostTargets.length})</summary>
          <DataTable columns={historyColumns} data={lostTargets} getRowId={(entry) => entry.player.id} />
        </details>
      )}
    </section>
  );
}

function TeamsView({ data, selectedTeam, setSelectedTeam, openPlayer }) {
  const team =
    data.teams.find((t) => t.squadra === selectedTeam) || data.teams[0];
  const players = team.player_ids
    .map((id) => data.players.find((p) => p.id === id))
    .filter(Boolean)
    .sort(
      (a, b) => a.ruolo.localeCompare(b.ruolo) || b.fvm_scaled - a.fvm_scaled,
    );
  const pieces = data.set_pieces.filter((p) => p.squadra === team.squadra);
  return (
    <section className="data-view">
      <div className="view-heading">
        <span className="eyebrow">SQUADRE SERIE A</span>
        <h1>Calendario, rosa e piazzati</h1>
      </div>
      <div className="team-picker">
        {data.teams.map((t) => (
          <button
            className={t.squadra === team.squadra ? "active" : ""}
            key={t.squadra}
            onClick={() => setSelectedTeam(t.squadra)}
          >
            <TeamBadge team={t.squadra} size={18} /> {t.squadra}
          </button>
        ))}
      </div>
      <section className="team-hero">
        <div>
          <span className="eyebrow">
            {team.coppa_europea || "NESSUNA COPPA"}
          </span>
          <h2>
            <TeamBadge team={team.squadra} size={32} /> {team.squadra}
          </h2>
          <p>
            {team.promossa ? "Neopromossa" : "Serie A"} · Rating attacco{" "}
            {team.rating_att}/10 · difesa {team.rating_dif}/10
          </p>
        </div>
        <div className="team-stats">
          <span>
            Punti prec.<b>{team.punti_prec}</b>
          </span>
          <span>
            GF / GS
            <b>
              {team.gf_prec} / {team.gs_prec}
            </b>
          </span>
          <span>
            xG / xGA
            <b>
              {team.xg_prec ?? "—"} / {team.xga_prec ?? "—"}
            </b>
          </span>
        </div>
      </section>
      <div className="team-grid">
        <section className="panel fixtures">
          <div className="panel-title">
            <div>
              <span className="eyebrow">CALENDARIO</span>
              <h2>Alternanza casa / trasferta</h2>
            </div>
            <span className="legend">
              <i className="home" />
              Casa <i className="away" />
              Trasferta
            </span>
          </div>
          <div className="fixture-grid">
            {team.fixtures.map((f) => (
              <div
                className={f.venue === "CASA" ? "home" : "away"}
                key={f.matchday}
              >
                <small>G{f.matchday}</small>
                <b>
                  {f.venue === "CASA" ? "vs" : "@"} {f.opponent}
                </b>
              </div>
            ))}
          </div>
        </section>
        <section className="panel setpiece-mini">
          <div className="panel-title">
            <div>
              <span className="eyebrow">PIAZZATI</span>
              <h2>Gerarchie</h2>
            </div>
          </div>
          {pieces.map((piece) => (
            <div key={piece.tipo}>
              <b>{piece.tipo}</b>
              {piece.takers.map((taker) => (
                <button
                  onClick={() =>
                    openPlayer(
                      data.players.find((p) => p.id === taker.player_id),
                    )
                  }
                  key={taker.player_id}
                >
                  {taker.nome}
                  <span>P{taker.priorita}</span>
                </button>
              ))}
            </div>
          ))}
        </section>
      </div>
      <section className="panel roster">
        <div className="panel-title">
          <div>
            <span className="eyebrow">ROSA LISTONE</span>
            <h2>{players.length} giocatori</h2>
          </div>
        </div>
        <div>
          {players.map((player) => (
            <button key={player.id} onClick={() => openPlayer(player)}>
              <i className={"role " + player.ruolo}>{player.ruolo}</i>
              <b>{player.nome}</b>
              <span
                className={"status " + statusClass(player.disponibilita.status)}
              >
                {player.disponibilita.status.replace("_", " ")}
              </span>
              <em>{player.fvm_scaled}</em>
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}

function SetPiecesView({ data, openPlayer }) {
  const types = ["RIGORI", "PUNIZIONI", "CORNER"];
  return (
    <section className="data-view">
      <div className="view-heading">
        <span className="eyebrow">SPECIALISTI</span>
        <h1>Rigoristi, punizioni e corner</h1>
        <p>
          Le gerarchie aperte non hanno un primo designato: il modello evita di
          assegnare loro un bonus artificiale.
        </p>
      </div>
      <div className="setpiece-board">
        {data.teams.map((team) => (
          <article key={team.squadra}>
            <h2>
              <TeamBadge team={team.squadra} size={20} /> {team.squadra}
            </h2>
            {types.map((type) => {
              const item = data.set_pieces.find(
                (p) => p.squadra === team.squadra && p.tipo === type,
              );
              return (
                <div key={type}>
                  <span>{type}</span>
                  {item?.takers.length ? (
                    item.takers.map((taker) => (
                      <button
                        key={taker.player_id}
                        onClick={() =>
                          openPlayer(
                            data.players.find((p) => p.id === taker.player_id),
                          )
                        }
                      >
                        {taker.nome}
                        <b>P{taker.priorita}</b>
                      </button>
                    ))
                  ) : (
                    <em>Da definire</em>
                  )}
                </div>
              );
            })}
          </article>
        ))}
      </div>
    </section>
  );
}

function AuctionStrategy({ advice }) {
  const recommendation =
    RECOMMENDATION_LABELS[advice.recommendation] || "Valuta";
  return (
    <section
      className={`strategy-panel ${advice.recommendation.toLowerCase()}`}
      aria-label="Consiglio strategico per la mia squadra"
    >
      <div className="strategy-verdict">
        <span className="strategy-kicker">CONSIGLIO PER LA MIA SQUADRA</span>
        <strong>{recommendation}</strong>
        <small>Confidenza {Math.round(advice.confidence * 100)}%</small>
      </div>
      <div className="strategy-prices">
        <div>
          <span>Fascia ideale</span>
          <strong>
            {advice.idealMin}-{advice.idealMax}
          </strong>
          <small>crediti</small>
        </div>
        <div>
          <span>Non superare</span>
          <strong>{advice.maxBid}</strong>
          <small>limite di valore</small>
        </div>
        <div>
          <span>Mercato stimato</span>
          <strong>{advice.summary.estimatedMarketPrice ?? "-"}</strong>
          <small>
            FVM {advice.summary.sourceFvm ?? "-"} · normalizzato{" "}
            {advice.summary.normalizedFvm ?? "-"}
          </small>
        </div>
      </div>
      <div className="strategy-explanation">
        <div>
          <h3>Perche</h3>
          {advice.reasons.slice(0, 3).map((reason) => (
            <p key={reason}>{reason}</p>
          ))}
        </div>
        <div>
          <h3>Attenzione</h3>
          {advice.risks.length ? (
            advice.risks.slice(0, 3).map((risk) => <p key={risk}>{risk}</p>)
          ) : (
            <p>Nessun rischio specifico rilevato.</p>
          )}
        </div>
      </div>
      <div className="strategy-bottom">
        <div className="role-plan">
          <h3>Piano rosa</h3>
          {Object.entries(advice.rolePlan).map(([role, plan]) => (
            <div key={role}>
              <span className={`role ${role}`}>{role}</span>
              <b>{plan.open ? `${plan.open} posti` : "Completo"}</b>
              <small>
                {plan.open
                  ? `Target ${plan.budgetTarget} · residuo ${plan.budgetRemaining}`
                  : `${plan.owned} acquistati`}
              </small>
            </div>
          ))}
        </div>
        <div className="strategy-alternatives">
          <h3>Alternative</h3>
          {advice.alternatives.length ? (
            advice.alternatives.map((alternative) => (
              <div key={alternative.id}>
                <b>{alternative.name}</b>
                <span>stima {alternative.estimatedCost} cr.</span>
              </div>
            ))
          ) : (
            <p>Nessuna alternativa comparabile disponibile.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function SaveIndicator({ status }) {
  const label =
    status.status === "pending"
      ? "Salvataggio..."
      : status.status === "saved"
        ? `Salvato alle ${formatSavedAt(status.at)}`
        : status.status === "error"
          ? `Errore nel salvataggio${status.error ? `: ${status.error}` : ""}`
          : "";
  if (!label) return null;
  return (
    <span className={`save-indicator ${status.status}`} role="status">
      {label}
    </span>
  );
}

/** A previously nominated-but-unconfirmed player, restored only if still findable and unsold. */
const restoreCandidate = (pending, players, assigned) => {
  if (!pending) return null;
  const candidate = players.find((p) => playerIdKey(p.id) === playerIdKey(pending.playerId));
  return candidate && !assigned[playerIdKey(candidate.id)] ? candidate : null;
};

function Auction({ data, openPlayer, rules, profileId, apiBase, playerStatus, isPlayerStatusLoading, onRefreshPlayerStatus }) {
  const activeRules = normalizeRules(
    rules ?? data.league_rules ?? { startingCredits: 750 },
  );
  const activeProfileId = String(
    profileId ?? data.profileId ?? data.profile_id ?? "default",
  );
  const rulesSignature = JSON.stringify(activeRules);
  const defaultUserTeamIndex = resolveUserTeamIndex(activeRules);
  const initializeSession = () => {
    const { envelope, restored } = loadActiveEnvelope(activeProfileId);
    if (envelope) {
      const hydrated = rehydrateAuction(envelope.state.auction, data.players, activeRules);
      if (hydrated) {
        return {
          meta: { sessionId: envelope.sessionId, name: envelope.name, createdAt: envelope.createdAt },
          auctionState: hydrated,
          pendingNomination: envelope.state.pendingNomination || null,
          restoredAt: restored ? envelope.updatedAt : null,
          warning: null,
        };
      }
    }
    const fresh = createEnvelope(activeProfileId, activeRules);
    return {
      meta: { sessionId: fresh.sessionId, name: fresh.name, createdAt: fresh.createdAt },
      auctionState: emptyAuction(activeRules),
      pendingNomination: null,
      restoredAt: null,
      warning: envelope
        ? "Non e' stato possibile ripristinare la sessione salvata (le regole della lega sono cambiate): ho aperto un'asta nuova. I dati precedenti restano salvati."
        : null,
    };
  };
  const [initial] = useState(initializeSession);
  const initialCandidate = restoreCandidate(initial.pendingNomination, data.players, initial.auctionState.assigned);
  const [state, setState] = useState(initial.auctionState);
  const [envelopeMeta, setEnvelopeMeta] = useState(initial.meta);
  const [restoredAt, setRestoredAt] = useState(initial.restoredAt);
  const [userTeamIndex, setUserTeamIndex] = useState(defaultUserTeamIndex);
  const [targets, setTargets] = useTargets(activeProfileId, data.players);
  const [query, setQuery] = useState(initialCandidate?.nome || "");
  const [player, setPlayer] = useState(initialCandidate);
  const [owner, setOwner] = useState(initialCandidate ? initial.pendingNomination.owner : userTeamIndex);
  const [price, setPrice] = useState(initialCandidate ? initial.pendingNomination.price : "");
  const [advice, setAdvice] = useState(null);
  const [overviewAdvice, setOverviewAdvice] = useState(null);
  const [message, setMessage] = useState(
    initial.warning || "Cerca un giocatore e assegna il suo prezzo.",
  );
  const [messageType, setMessageType] = useState(initial.warning ? "error" : "info");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState({ status: "idle" });
  const [mobileTeamIndex, setMobileTeamIndex] = useState(0);
  const worker = useRef();
  const skipPersist = useRef(false);
  const importInputRef = useRef(null);
  const autosaveRef = useRef(null);
  if (!autosaveRef.current) {
    autosaveRef.current = createAutosave({ delay: 400, onStatusChange: setSaveStatus });
  }
  const workerHistory = state.history.flatMap((transaction) => {
    const transactionPlayer = data.players.find(
      (candidate) =>
        playerIdKey(candidate.id) === playerIdKey(transaction.playerId),
    );
    return transactionPlayer
      ? [{ ...transaction, player: transactionPlayer }]
      : [];
  });
  useEffect(() => () => autosaveRef.current?.flush(), []);
  useEffect(() => {
    autosaveRef.current?.flush();
    skipPersist.current = true;
    const next = initializeSession();
    const candidate = restoreCandidate(next.pendingNomination, data.players, next.auctionState.assigned);
    setState(next.auctionState);
    setEnvelopeMeta(next.meta);
    setRestoredAt(next.restoredAt);
    setUserTeamIndex(defaultUserTeamIndex);
    setPlayer(candidate);
    setQuery(candidate?.nome || "");
    setOwner(candidate ? next.pendingNomination.owner : defaultUserTeamIndex);
    setPrice(candidate ? next.pendingNomination.price : "");
    if (next.warning) {
      setMessage(next.warning);
      setMessageType("error");
    }
  }, [activeProfileId, rulesSignature, defaultUserTeamIndex]);
  useEffect(() => {
    if (skipPersist.current) {
      skipPersist.current = false;
      return;
    }
    autosaveRef.current.schedule({
      schemaVersion: SESSION_SCHEMA_VERSION,
      sessionId: envelopeMeta.sessionId,
      profileId: activeProfileId,
      name: envelopeMeta.name,
      createdAt: envelopeMeta.createdAt,
      updatedAt: new Date().toISOString(),
      state: {
        auction: serializeAuction(state),
        pendingNomination: player ? { playerId: player.id, owner, price } : null,
      },
    });
  }, [state, player, owner, price, envelopeMeta, activeProfileId]);
  useEffect(() => {
    worker.current = new Worker(
      new URL("./simulation.worker.js", import.meta.url),
      { type: "module" },
    );
    worker.current.onmessage = (e) =>
      e.data.kind === "overview"
        ? setOverviewAdvice(e.data)
        : setAdvice(e.data);
    return () => worker.current.terminate();
  }, []);
  useEffect(() => {
    if (!player) return setAdvice(null);
    worker.current.postMessage({
      player,
      owner: userTeamIndex,
      mine: state.teams[userTeamIndex],
      teams: state.teams,
      remaining: data.players.filter((p) => !state.assigned[playerIdKey(p.id)]),
      assigned: state.assigned,
      history: workerHistory,
      rules: activeRules,
    });
  }, [player, state, data, rulesSignature, userTeamIndex]);
  useEffect(() => {
    worker.current.postMessage({
      mode: "overview",
      owner: userTeamIndex,
      mine: state.teams[userTeamIndex],
      teams: state.teams,
      remaining: data.players.filter((p) => !state.assigned[playerIdKey(p.id)]),
      assigned: state.assigned,
      history: workerHistory,
      rules: activeRules,
    });
  }, [state, data, rulesSignature, userTeamIndex]);
  const activeRole = activeNominationRole(state.teams, activeRules);
  const choices = data.players
    .filter(
      (p) =>
        !state.assigned[playerIdKey(p.id)] &&
        (!activeRole || p.ruolo === activeRole) &&
        query.length >= 2 &&
        p.nome.toLowerCase().includes(query.toLowerCase()),
    )
    .slice(0, 7);
  const selectPlayer = (candidate) => {
    if (activeRole && candidate.ruolo !== activeRole) {
      setMessage(`In questa fase puoi chiamare solo ${ROLE_LABELS[activeRole].toLowerCase()}.`);
      return setMessageType("error");
    }
    setPlayer(candidate);
    setQuery(candidate.nome);
    setPrice("");
    setSuggestionsOpen(false);
    setMessage(`Hai selezionato ${candidate.nome}. Scegli squadra e prezzo.`);
    setMessageType("info");
  };
  const assign = () => {
    const value = Number(price),
      team = state.teams[owner];
    if (!player) return;
    if (state.assigned[playerIdKey(player.id)]) {
      setMessage(`${player.nome} risulta gia assegnato.`);
      return setMessageType("error");
    }
    if (activeRole && player.ruolo !== activeRole) {
      setMessage(`In questa fase puoi assegnare solo ${ROLE_LABELS[activeRole].toLowerCase()}.`);
      return setMessageType("error");
    }
    if (!Number.isInteger(value) || value < activeRules.auction.minPrice) {
      setMessage(
        `Inserisci un prezzo intero di almeno ${activeRules.auction.minPrice} crediti.`,
      );
      return setMessageType("error");
    }
    if (
      (value - activeRules.auction.minPrice) %
      activeRules.auction.increment
    ) {
      setMessage(
        `Il prezzo deve salire di ${activeRules.auction.increment} crediti a partire da ${activeRules.auction.minPrice}.`,
      );
      return setMessageType("error");
    }
    const legalMax = legalMaxBid(team, activeRules);
    if (value > legalMax) {
      setMessage(
        `${team.name} puo spendere al massimo ${legalMax} crediti: deve conservarne ${Math.max(0, Object.values(slotsLeft(team, activeRules)).reduce((sum, count) => sum + count, 0) - 1) * activeRules.auction.reserve} per completare la rosa.`,
      );
      return setMessageType("error");
    }
    if (slotsLeft(team, activeRules)[player.ruolo] < 1) {
      setMessage(
        `${team.name} non ha piu posti per ${(ROLE_LABELS[player.ruolo] || player.ruolo).toLowerCase()}.`,
      );
      return setMessageType("error");
    }
    setState((s) => ({
      ...s,
      teams: s.teams.map((t, i) =>
        i === owner
          ? { ...t, credits: t.credits - value, roster: [...t.roster, player] }
          : t,
      ),
      assigned: {
        ...s.assigned,
        [playerIdKey(player.id)]: { owner, price: value },
      },
      history: [...s.history, { playerId: player.id, owner, price: value }],
      undone: [],
    }));
    setMessage(`${player.nome} assegnato a ${team.name} per ${value} crediti.`);
    setMessageType("success");
    setPlayer(null);
    setQuery("");
    setPrice("");
  };
  const undo = () => {
    const last = state.history.at(-1);
    if (!last) return;
    setState((s) => {
      const assigned = { ...s.assigned };
      delete assigned[playerIdKey(last.playerId)];
      return {
        ...s,
        assigned,
        history: s.history.slice(0, -1),
        undone: [...(s.undone || []), last],
        teams: s.teams.map((t, i) =>
          i === last.owner
            ? {
                ...t,
                credits: t.credits + last.price,
                roster: t.roster.filter(
                  (p) => playerIdKey(p.id) !== playerIdKey(last.playerId),
                ),
              }
            : t,
        ),
      };
    });
    setMessage(
      `Annullata l'assegnazione di ${data.players.find((p) => playerIdKey(p.id) === playerIdKey(last.playerId))?.nome || "giocatore"}.`,
    );
    setMessageType("info");
  };
  const redo = () => {
    const last = state.undone?.at(-1);
    if (!last) return;
    const team = state.teams[last.owner];
    const restoredPlayer = data.players.find(
      (p) => playerIdKey(p.id) === playerIdKey(last.playerId),
    );
    if (
      !restoredPlayer ||
      state.assigned[playerIdKey(last.playerId)] ||
      slotsLeft(team, activeRules)[restoredPlayer.ruolo] < 1 ||
      !isValidBid(last.price, team, activeRules)
    ) {
      setMessage(
        "Non posso ripristinare l'operazione: budget o slot sono cambiati.",
      );
      return setMessageType("error");
    }
    setState((s) => ({
      ...s,
      teams: s.teams.map((t, i) =>
        i === last.owner
          ? {
              ...t,
              credits: t.credits - last.price,
              roster: [...t.roster, restoredPlayer],
            }
          : t,
      ),
      assigned: {
        ...s.assigned,
        [playerIdKey(last.playerId)]: { owner: last.owner, price: last.price },
      },
      history: [...s.history, last],
      undone: s.undone.slice(0, -1),
    }));
    setMessage(`Ripristinata l'assegnazione di ${restoredPlayer.nome}.`);
    setMessageType("success");
  };
  const startNewAuction = () => {
    if (
      !window.confirm(
        "Vuoi iniziare una nuova asta? La sessione corrente resta salvata e recuperabile, ma non sara' piu' quella attiva.",
      )
    )
      return;
    autosaveRef.current.flush();
    const { envelope } = startNewSession(activeProfileId, activeRules);
    skipPersist.current = true;
    setState(emptyAuction(activeRules));
    setEnvelopeMeta({ sessionId: envelope.sessionId, name: envelope.name, createdAt: envelope.createdAt });
    setRestoredAt(null);
    setPlayer(null);
    setQuery("");
    setPrice("");
    setSuggestionsOpen(false);
    setMessage("Nuova asta iniziata. La sessione precedente resta salvata.");
    setMessageType("success");
  };
  const exportSession = () => {
    const envelope = {
      schemaVersion: SESSION_SCHEMA_VERSION,
      sessionId: envelopeMeta.sessionId,
      profileId: activeProfileId,
      name: envelopeMeta.name,
      createdAt: envelopeMeta.createdAt,
      updatedAt: new Date().toISOString(),
      state: {
        auction: serializeAuction(state),
        pendingNomination: player ? { playerId: player.id, owner, price } : null,
      },
    };
    const blob = new Blob([exportEnvelope(envelope)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `asta-${activeProfileId}-${envelope.sessionId.slice(0, 8)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };
  const importSession = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (
      !window.confirm(
        "Importare questo file sostituira' l'asta visualizzata ora. La sessione corrente resta comunque salvata e recuperabile. Continuare?",
      )
    )
      return;
    const text = await file.text();
    const result = parseImportedEnvelope(text, {
      profileId: activeProfileId,
      players: data.players,
      rules: activeRules,
    });
    if (!result.ok) {
      setMessage(`Import non riuscito: ${result.error}`);
      setMessageType("error");
      return;
    }
    autosaveRef.current.cancel();
    const applied = { ...result.envelope, updatedAt: new Date().toISOString() };
    const saved = saveEnvelope(applied);
    if (!saved.ok) {
      setMessage(`Import riuscito ma il salvataggio e' fallito: ${saved.error}`);
      setMessageType("error");
      return;
    }
    skipPersist.current = true;
    const hydrated = rehydrateAuction(applied.state.auction, data.players, activeRules) || emptyAuction(activeRules);
    const candidate = restoreCandidate(applied.state.pendingNomination, data.players, hydrated.assigned);
    setState(hydrated);
    setEnvelopeMeta({ sessionId: applied.sessionId, name: applied.name, createdAt: applied.createdAt });
    setRestoredAt(applied.updatedAt);
    setPlayer(candidate);
    setQuery(candidate?.nome || "");
    setOwner(candidate ? applied.state.pendingNomination.owner : userTeamIndex);
    setPrice(candidate ? applied.state.pendingNomination.price : "");
    setSaveStatus({ status: "saved", at: applied.updatedAt });
    setMessage(`Asta "${applied.name}" importata correttamente.`);
    setMessageType("success");
  };
  const selectedLegalMax = legalMaxBid(state.teams[owner], activeRules);
  const availablePlayers = useMemo(
    () => data.players.filter((p) => !state.assigned[playerIdKey(p.id)]),
    [data.players, state.assigned],
  );
  const opponentTeams = useMemo(
    () =>
      state.teams
        .map((team, index) => ({ team, index }))
        .filter(({ index }) => index !== userTeamIndex)
        .map(({ team }) => ({
          name: team.name,
          budgetResidual: team.credits,
          slotsByRole: slotsLeft(team, activeRules),
        })),
    [state.teams, userTeamIndex, activeRules],
  );
  const myTeamSlots = useMemo(
    () => ({ slotsByRole: slotsLeft(state.teams[userTeamIndex], activeRules) }),
    [state.teams, userTeamIndex, activeRules],
  );
  const dashboardItems = useMemo(() => {
    const items = [
      {
        id: "tracker",
        props: {
          state,
          setState,
          userTeamIndex,
          activeRules,
          players: data.players,
          overview: overviewAdvice,
          player,
          owner,
          mobileTeamIndex,
          setMobileTeamIndex,
          playerStatus: playerStatus?.players,
          openPlayer,
        },
      },
      {
        id: "fixtureAdvisor",
        props: {
          players: data.players,
          teams: data.teams,
          assigned: state.assigned,
          activeRole,
          defaultFromMatchday: data.calendario_lega?.matchdays?.[0]?.serie_a_matchday ?? 1,
          openPlayer,
          playerStatus: playerStatus?.players,
          targets,
          setTargets,
        },
      },
      {
        id: "watchlist",
        props: { targets, players: data.players, assigned: state.assigned, myTeamIndex: userTeamIndex, openPlayer },
      },
      {
        id: "nominationSuggestions",
        props: {
          availablePlayers,
          watchlist: targets,
          myTeam: myTeamSlots,
          opponentTeams,
          budgetPlan: overviewAdvice?.rolePlan,
          apiBase,
        },
      },
    ];
    if (player) {
      items.push({
        id: "aiAdvisor",
        props: { player, state, owner, price, advice, data, activeRules, apiBase },
      });
    }
    return items;
  }, [
    state,
    userTeamIndex,
    activeRules,
    data,
    overviewAdvice,
    player,
    owner,
    mobileTeamIndex,
    playerStatus,
    openPlayer,
    activeRole,
    targets,
    availablePlayers,
    myTeamSlots,
    opponentTeams,
    apiBase,
    price,
    advice,
  ]);
  return (
    <section className="data-view auction">
      <div className="view-heading">
        <span className="eyebrow">MODALITA OPERATIVA</span>
        <h1>Asta live</h1>
        <p>
          Un passaggio alla volta: scegli il giocatore, indica chi lo compra e
          conferma il prezzo.
        </p>
        <SaveIndicator status={saveStatus} />
        <p className="player-status-freshness">
          Stato giocatori aggiornato:{" "}
          {isPlayerStatusLoading && !playerStatus?.fetchedAt ? (
            <Skeleton width={90} height={12} />
          ) : (
            formatPlayerStatusUpdatedAt(playerStatus?.fetchedAt) || "non disponibile"
          )}
          <button type="button" onClick={() => onRefreshPlayerStatus?.(true)}>
            Aggiorna ora
          </button>
        </p>
      </div>
      {restoredAt && (
        <p className="session-banner" role="status">
          Sessione ripristinata — ultimo salvataggio {formatSavedAt(restoredAt)}
          <button
            type="button"
            onClick={() => setRestoredAt(null)}
            aria-label="Chiudi avviso sessione ripristinata"
          >
            ×
          </button>
        </p>
      )}
      <div className="auction-owner">
        <label htmlFor="auction-user-team">La mia squadra</label>
        <select
          id="auction-user-team"
          value={userTeamIndex}
          onChange={(e) => {
            const nextIndex = Number(e.target.value);
            setUserTeamIndex(nextIndex);
            setOwner(nextIndex);
          }}
        >
          {state.teams.map((team, index) => (
            <option value={index} key={index}>
              {team.name}
            </option>
          ))}
        </select>
        <small>Usata per consigli, budget e riepilogo.</small>
      </div>
      <p
        className={`auction-status ${messageType}`}
        role="status"
        aria-live="polite"
      >
        {message}
      </p>
      {activeRole && (
        <p className="auction-status info" role="status">
          Fase attiva: {ROLE_LABELS[activeRole]}. Completa i posti di questo ruolo in tutte le rose per passare al successivo.
        </p>
      )}
      <div className="auction-bar">
        <div
          className="auction-search"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget))
              setSuggestionsOpen(false);
          }}
        >
          <label htmlFor="auction-player">Giocatore in asta</label>
          <input
            id="auction-player"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (player && activeRole && player.ruolo !== activeRole) setPlayer(null);
              setSuggestionsOpen(true);
            }}
            onFocus={() => setSuggestionsOpen(true)}
            onKeyDown={(e) => e.key === "Escape" && setSuggestionsOpen(false)}
            placeholder="Scrivi almeno 2 lettere"
            autoComplete="off"
            aria-describedby="auction-results"
          />
          {suggestionsOpen && query.length >= 2 && (
            <div className="auction-results" id="auction-results">
              <span>
                {choices.length
                  ? `${choices.length} giocatori trovati`
                  : "Nessun giocatore disponibile"}
              </span>
              {choices.map((p) => (
                <div key={p.id} className="auction-result-row">
                  <button
                    onClick={() => selectPlayer(p)}
                    aria-label={`Seleziona ${p.nome}, ${p.ruolo}, ${p.squadra}`}
                  >
                    <i className={"role " + p.ruolo}>{p.ruolo}</i>
                    <b>{p.nome}</b>
                    <PlayerStatusBadge players={playerStatus?.players} name={p.nome} />
                    <small>
                      <TeamBadge team={p.squadra} size={14} /> {p.squadra} · {p.fvm_scaled}
                    </small>
                  </button>
                  <TargetStar player={p} targets={targets} setTargets={setTargets} />
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="auction-history">
          <button onClick={undo} disabled={!state.history.length}>
            Annulla ultima
          </button>
          <button onClick={redo} disabled={!state.undone?.length}>
            Ripristina
          </button>
          <button onClick={exportSession}>Esporta asta</button>
          <button onClick={() => importInputRef.current?.click()}>
            Importa asta
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            onChange={importSession}
            style={{ display: "none" }}
          />
          <button className="flush" onClick={startNewAuction}>
            Nuova asta
          </button>
        </div>
      </div>
      {player && (
        <section className="auction-advice">
          <div>
            <span className={"role " + player.ruolo}>{player.ruolo}</span>
            <h2>
              {player.nome} <PlayerStatusBadge players={playerStatus?.players} name={player.nome} />
            </h2>
            <p>
              <TeamBadge team={player.squadra} size={14} /> {player.squadra} · {formatTier(player.guida_asta_fascia)}
            </p>
          </div>
          <div>
            <span>Prezzo max consigliato</span>
            <strong>{advice?.maxBid ?? "..."}</strong>
            <small>{advice?.utility || "Calcolo in corso"}</small>
          </div>
          <label className="auction-field auction-field--reserved-help">
            Squadra acquirente
            <select value={owner} onChange={(e) => setOwner(+e.target.value)}>
              {state.teams.map((t, i) => (
                <option value={i} key={i}>
                  {t.name} · {t.credits} cr.
                </option>
              ))}
            </select>
          </label>
          <label className="auction-field">
            Prezzo di acquisto (crediti)
            <input
              value={price}
              type="number"
              min={activeRules.auction.minPrice}
              max={selectedLegalMax}
              step={activeRules.auction.increment}
              onChange={(e) => setPrice(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && assign()}
              placeholder="Prezzo"
              inputMode="numeric"
            />
            <small className="field-help">
              Massimo consentito: {selectedLegalMax}
            </small>
          </label>
          <div className="auction-actions">
            <button onClick={assign}>Conferma assegnazione</button>
            <button className="secondary" onClick={() => openPlayer(player)}>
              Vedi scheda
            </button>
            <button
              className="secondary"
              onClick={() => {
                setPlayer(null);
                setQuery("");
                setPrice("");
                setSuggestionsOpen(false);
                setMessage("Selezione annullata.");
                setMessageType("info");
              }}
            >
              Annulla
            </button>
          </div>
        </section>
      )}
      {player && advice && <AuctionStrategy advice={advice} />}
      <DashboardGrid registry={WIDGET_REGISTRY} items={dashboardItems} />
    </section>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
