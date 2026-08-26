const clamp01 = (value) => Math.max(0, Math.min(1, value));

/** Per-role min/max of a numeric field, skipping players missing that field. */
const minMaxByRole = (items, roleOf, valueOf) => {
  const byRole = new Map();
  for (const item of items) {
    const value = valueOf(item);
    if (value == null || Number.isNaN(value)) continue;
    const role = roleOf(item);
    const bounds = byRole.get(role) || { min: Infinity, max: -Infinity };
    bounds.min = Math.min(bounds.min, value);
    bounds.max = Math.max(bounds.max, value);
    byRole.set(role, bounds);
  }
  return byRole;
};

const normalize = (value, bounds) => {
  if (value == null) return null;
  if (!bounds || bounds.max === bounds.min) return 0.5;
  return clamp01((value - bounds.min) / (bounds.max - bounds.min));
};

/** Mean of (expected vote * play probability + expected bonus) over the matchday window. */
const fixtureScoreFor = (player, fromMatchday, windowSize) => {
  const votes = player.voto_puro_mean_per_giornata;
  const plays = player.p_gioca_per_giornata;
  const bonuses = player.bonus_atteso_per_giornata;
  if (!Array.isArray(votes) || !Array.isArray(plays) || !Array.isArray(bonuses) || !votes.length) {
    return null;
  }
  const length = votes.length;
  const startIndex = Math.max(0, Math.min(length - 1, fromMatchday - 1));
  const endIndex = Math.max(startIndex, Math.min(length - 1, fromMatchday - 1 + windowSize - 1));
  const days = [];
  for (let index = startIndex; index <= endIndex; index += 1) {
    const vote = votes[index];
    const play = plays[index];
    const bonus = bonuses[index];
    if (vote == null || play == null || bonus == null) continue;
    days.push(vote * play + bonus);
  }
  return days.length ? days.reduce((sum, value) => sum + value, 0) / days.length : null;
};

const fixtureLabelFor = (fixtureNorm) => {
  if (fixtureNorm == null) return null;
  if (fixtureNorm > 0.66) return "facile";
  if (fixtureNorm > 0.33) return "medio";
  return "duro";
};

/**
 * Enriches players with a fixture-aware score for an upcoming window of
 * matchdays, blended with their overall quality (fvm_scaled) - both
 * normalized min-max *within the same role*, since goalkeepers and
 * forwards live on different scales.
 *
 * A player missing per-matchday projections gets fixtureScore/fixtureLabel
 * null and falls back to their quality score alone, rather than being
 * penalized or excluded.
 */
export function scoreByUpcomingFixtures(players, { fromMatchday = 1, windowSize = 5 } = {}) {
  const withFixtureScore = players.map((player) => ({
    player,
    fixtureScore: fixtureScoreFor(player, fromMatchday, windowSize),
  }));
  const qualityBounds = minMaxByRole(players, (p) => p.ruolo, (p) => p.fvm_scaled);
  const fixtureBounds = minMaxByRole(
    withFixtureScore,
    ({ player }) => player.ruolo,
    ({ fixtureScore }) => fixtureScore,
  );
  return withFixtureScore.map(({ player, fixtureScore }) => {
    const qualityNorm = normalize(player.fvm_scaled, qualityBounds.get(player.ruolo)) ?? 0;
    const fixtureNorm = fixtureScore == null ? null : normalize(fixtureScore, fixtureBounds.get(player.ruolo));
    const combinedScore = fixtureNorm == null ? qualityNorm : 0.65 * qualityNorm + 0.35 * fixtureNorm;
    return {
      ...player,
      fixtureScore,
      combinedScore,
      fixtureLabel: fixtureLabelFor(fixtureNorm),
    };
  });
}
