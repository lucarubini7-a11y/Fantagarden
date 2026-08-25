import { playerIdKey } from "./auction-state.js";

export const TARGETS_STORAGE_VERSION = 1;

export const targetsStorageKey = (profileId) =>
  `fanta-targets-v${TARGETS_STORAGE_VERSION}:${encodeURIComponent(profileId || "default")}`;

export const emptyTargets = () => ({});

const normalizedMaxBid = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};

/** Rebuilds a targets map from storage, dropping entries for players no longer in the dataset. */
export const rehydrateTargets = (saved, players) => {
  if (!saved || typeof saved !== "object" || saved.version !== TARGETS_STORAGE_VERSION) return emptyTargets();
  const entries = saved.targets;
  if (!entries || typeof entries !== "object") return emptyTargets();
  const knownIds = new Set((players || []).map((player) => playerIdKey(player.id)));
  const targets = {};
  for (const [id, meta] of Object.entries(entries)) {
    if (!knownIds.has(id)) continue;
    targets[id] = {
      note: typeof meta?.note === "string" ? meta.note : "",
      maxBid: normalizedMaxBid(meta?.maxBid),
    };
  }
  return targets;
};

export const serializeTargets = (targets) => ({
  version: TARGETS_STORAGE_VERSION,
  targets,
});

export const isTargeted = (targets, playerId) => Boolean(targets[playerIdKey(playerId)]);

export const addTarget = (targets, playerId) => {
  const id = playerIdKey(playerId);
  if (targets[id]) return targets;
  return { ...targets, [id]: { note: "", maxBid: null } };
};

export const removeTarget = (targets, playerId) => {
  const id = playerIdKey(playerId);
  if (!targets[id]) return targets;
  const next = { ...targets };
  delete next[id];
  return next;
};

export const setTargetNote = (targets, playerId, note) => {
  const id = playerIdKey(playerId);
  if (!targets[id]) return targets;
  return { ...targets, [id]: { ...targets[id], note: String(note) } };
};

export const setTargetMaxBid = (targets, playerId, maxBid) => {
  const id = playerIdKey(playerId);
  if (!targets[id]) return targets;
  return { ...targets, [id]: { ...targets[id], maxBid: normalizedMaxBid(maxBid) } };
};
