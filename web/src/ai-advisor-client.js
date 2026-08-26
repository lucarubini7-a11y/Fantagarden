import { playerIdKey, slotsLeft } from "./auction-state.js";

const ALTERNATIVES_LIMIT = 5;

/** Best available replacements for the same role, excluding the current candidate. */
export function topAlternatives(players, role, assigned, excludeId, limit = ALTERNATIVES_LIMIT) {
  return players
    .filter(
      (p) =>
        p.ruolo === role &&
        !assigned[playerIdKey(p.id)] &&
        playerIdKey(p.id) !== playerIdKey(excludeId),
    )
    .sort((a, b) => (b.fvm_scaled ?? 0) - (a.fvm_scaled ?? 0))
    .slice(0, limit);
}

/**
 * Builds the request body sent to /api/advisor-live. Opponents are always
 * reduced to budget + open slots - never their individual rosters.
 */
export function buildAdvisorContext({ player, maxBid, currentBid, myTeam, otherTeams, alternatives }) {
  return {
    player: {
      nome: player.nome,
      ruolo: player.ruolo,
      squadra: player.squadra,
      fvm: player.fvm_scaled,
      prezzo_max_consigliato: maxBid ?? null,
    },
    current_bid: currentBid ?? null,
    my_team: {
      budget_residuo: myTeam.credits,
      slot_rimasti_per_ruolo: myTeam.slotsLeft,
      giocatori_gia_presi: myTeam.roster.map((p) => p.nome),
    },
    other_teams: otherTeams.map((team) => ({
      nome_squadra: team.name,
      budget_residuo: team.credits,
      slot_rimasti_per_ruolo: team.slotsLeft,
    })),
    top_alternative_players: alternatives.map((p) => ({ nome: p.nome, fvm: p.fvm_scaled })),
  };
}

/**
 * Builds the /api/advisor-live request body for the "pick one of these 5
 * nomination suggestions" mode. Opponents are reduced to the same
 * budget+slots aggregate as evaluate_candidate - never their roster - by
 * construction, since only those fields are ever read off `opponentTeams`.
 */
export function contextFromNominationSuggestions({ suggestions, myTeam, opponentTeams }) {
  return {
    mode: "suggest_nomination",
    my_team: {
      budget_residuo: myTeam?.budgetResidual ?? null,
      slot_rimasti_per_ruolo: myTeam?.slotsByRole ?? {},
    },
    other_teams: (opponentTeams || []).map((team) => ({
      nome_squadra: team.name,
      budget_residuo: team.budgetResidual,
      slot_rimasti_per_ruolo: team.slotsByRole,
    })),
    top_suggestions: (suggestions || []).map((entry) => ({
      player: { nome: entry.player.nome, ruolo: entry.player.ruolo, squadra: entry.player.squadra },
      score: entry.score,
      reasons: entry.reasons,
    })),
  };
}

/** Assembles the advisor context directly from the live Auction component's state. */
export function contextFromAuctionState({ player, state, owner, price, advice, players, rules }) {
  const teamsWithSlots = state.teams.map((team) => ({ ...team, slotsLeft: slotsLeft(team, rules) }));
  const myTeam = teamsWithSlots[owner] ?? teamsWithSlots[0];
  const otherTeams = teamsWithSlots.filter((_, index) => index !== owner);
  const alternatives = topAlternatives(players, player.ruolo, state.assigned, player.id);
  const numericBid = Number(price);
  return buildAdvisorContext({
    player,
    maxBid: advice?.maxBid ?? null,
    currentBid: price !== "" && Number.isFinite(numericBid) ? numericBid : null,
    myTeam,
    otherTeams,
    alternatives,
  });
}

/**
 * Calls the local /api/advisor-live endpoint. Never rejects: every failure
 * (HTTP error, server-reported unavailability, network error, timeout)
 * resolves to {status: "unavailable", reason, detail}.
 */
export async function fetchAdvisorAdvice(apiBase, context, { fetchImpl = globalThis.fetch, timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${String(apiBase || "").replace(/\/$/, "")}/api/advisor-live`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(context),
      signal: controller.signal,
    });
    if (!response.ok) {
      return { status: "unavailable", reason: "http_error", detail: `HTTP ${response.status}` };
    }
    const payload = await response.json();
    if (payload?.available) {
      return { status: "success", advice: payload.advice, model: payload.model };
    }
    return { status: "unavailable", reason: payload?.reason || "api_error", detail: payload?.detail };
  } catch (error) {
    return {
      status: "unavailable",
      reason: "network_error",
      detail: error?.name === "AbortError" ? "timeout" : error?.message,
    };
  } finally {
    clearTimeout(timer);
  }
}
