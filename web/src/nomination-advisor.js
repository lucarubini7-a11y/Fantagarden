import { playerIdKey } from "./auction-state.js";

const ROLES = ["P", "D", "C", "A"];
const MIN_EMPTY_SLOTS_FOR_DECOY = 2;
const MAX_THREATS_FOR_READY_TARGET = 1;

const SIGNAL_SCORES = {
  readyTarget: { alta: 60, media: 40 },
  decoy: 45,
  hiddenGem: 30,
};

const mean = (values) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

const median = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

/** Opponents still able to seriously compete for `role`: an open slot and above-average remaining budget. */
const threatsForRole = (opponentTeams, role) => {
  const avgBudget = mean(opponentTeams.map((team) => team.budgetResidual));
  return opponentTeams.filter(
    (team) => (team.slotsByRole[role] || 0) > 0 && team.budgetResidual > avgBudget,
  );
};

/** Signal A: it's on the watchlist with real priority, and the field for that role is thinning out. */
const readyTargetSignal = (player, watchlistEntry, myTeam, budgetPlan, opponentTeams) => {
  if (!watchlistEntry || (watchlistEntry.priority !== "alta" && watchlistEntry.priority !== "media")) {
    return null;
  }
  if (myTeam && (myTeam.slotsByRole?.[player.ruolo] ?? 1) <= 0) return null;
  if (budgetPlan?.[player.ruolo] && budgetPlan[player.ruolo].budgetRemaining <= 0) return null;
  const threats = threatsForRole(opponentTeams, player.ruolo);
  if (threats.length > MAX_THREATS_FOR_READY_TARGET) return null;
  return {
    kind: "readyTarget",
    score: SIGNAL_SCORES.readyTarget[watchlistEntry.priority],
    reason: "È un tuo obiettivo e la concorrenza per questo ruolo si sta esaurendo.",
  };
};

/** Signal B: not a priority for you, but a decoy that costs opponents real money to ignore. */
const decoySignal = (player, watchlistEntry, opponentTeams) => {
  if (watchlistEntry && (watchlistEntry.priority === "alta" || watchlistEntry.priority === "media")) {
    return null;
  }
  const avgBudget = mean(opponentTeams.map((team) => team.budgetResidual));
  const spenders = opponentTeams.filter(
    (team) =>
      (team.slotsByRole[player.ruolo] || 0) >= MIN_EMPTY_SLOTS_FOR_DECOY &&
      team.budgetResidual > avgBudget,
  );
  if (spenders.length < 2) return null;
  const names = spenders.map((team) => team.name).join(" e ");
  const minSlots = Math.min(...spenders.map((team) => team.slotsByRole[player.ruolo]));
  return {
    kind: "decoy",
    score: SIGNAL_SCORES.decoy,
    reason: `Nominalo per far spendere ${names}: hanno ancora ${minSlots} slot vuoti in questo ruolo e budget alto.`,
  };
};

/** Signal C: solid FVM for the role, but nobody left actually needs it. */
const hiddenGemSignal = (player, availablePlayers, opponentTeams) => {
  const roleValues = availablePlayers
    .filter((candidate) => candidate.ruolo === player.ruolo)
    .map((candidate) => candidate.fvm_scaled ?? 0);
  if (median(roleValues) === 0 || (player.fvm_scaled ?? 0) <= median(roleValues)) return null;
  const stillNeeded = opponentTeams.some((team) => (team.slotsByRole[player.ruolo] || 0) > 0);
  if (stillNeeded) return null;
  return {
    kind: "hiddenGem",
    score: SIGNAL_SCORES.hiddenGem,
    reason: "Nessuno lo cerca più, probabile affare.",
  };
};

/**
 * Ranks available players by how good a call-out they'd make right now,
 * blending three independent signals (a thinning-out personal target, a
 * decoy that drains opponents' budget, or a quality player nobody needs
 * anymore) rather than a single "should I buy this" score. Reuses the
 * budget/slot numbers already computed elsewhere (simulation.worker.js's
 * budgetPlan, the tracker's per-team credits/roster) instead of
 * recomputing them.
 */
export function suggestNominations({
  watchlist = {},
  availablePlayers = [],
  myTeam = null,
  opponentTeams = [],
  budgetPlan = null,
}) {
  const results = [];
  for (const player of availablePlayers) {
    if (!ROLES.includes(player.ruolo)) continue;
    const watchlistEntry = watchlist[playerIdKey(player.id)];
    const signals = [
      readyTargetSignal(player, watchlistEntry, myTeam, budgetPlan, opponentTeams),
      decoySignal(player, watchlistEntry, opponentTeams),
      hiddenGemSignal(player, availablePlayers, opponentTeams),
    ].filter(Boolean);
    if (!signals.length) continue;
    results.push({
      player,
      score: signals.reduce((sum, signal) => sum + signal.score, 0),
      reasons: signals.map((signal) => signal.reason),
      primarySignal: signals.reduce((best, signal) => (signal.score > best.score ? signal : best)).kind,
    });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 5);
}
