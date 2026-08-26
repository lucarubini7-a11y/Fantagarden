import { useEffect, useState } from "react";
import { playerIdKey } from "./auction-state.js";

export const TARGETS_STORAGE_VERSION = 1;

export const TARGET_PRIORITIES = ["alta", "media", "bassa"];
const DEFAULT_PRIORITY = "media";

export const targetsStorageKey = (profileId) =>
  `fanta-targets-v${TARGETS_STORAGE_VERSION}:${encodeURIComponent(profileId || "default")}`;

export const emptyTargets = () => ({});

const normalizedMaxBid = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};

const normalizedPriority = (value) =>
  TARGET_PRIORITIES.includes(value) ? value : DEFAULT_PRIORITY;

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
      priority: normalizedPriority(meta?.priority),
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
  return { ...targets, [id]: { note: "", maxBid: null, priority: DEFAULT_PRIORITY } };
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

export const setTargetPriority = (targets, playerId, priority) => {
  const id = playerIdKey(playerId);
  if (!targets[id]) return targets;
  return { ...targets, [id]: { ...targets[id], priority: normalizedPriority(priority) } };
};

/**
 * Where a target stands right now: "achieved" once it lands on your own
 * roster, "lost" once another team takes it (kept visible, not deleted —
 * useful to review after the auction), otherwise "active".
 */
export const targetStatus = (assignedEntry, myTeamIndex) => {
  if (!assignedEntry) return "active";
  return assignedEntry.owner === myTeamIndex ? "achieved" : "lost";
};

/**
 * Shared targets state, backed by localStorage under the per-profile key.
 * Any tab can call this and get/set the same list; since the tabs that
 * read it (Obiettivi, Asta live) are never mounted at the same time, a
 * plain read-on-mount/write-on-change pair is enough to keep them in
 * sync — no cross-component event bus needed.
 */
export function useTargets(profileId, players) {
  const storageKey = targetsStorageKey(profileId);
  const [targets, setTargets] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      return rehydrateTargets(saved, players);
    } catch {
      return emptyTargets();
    }
  });
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(serializeTargets(targets)));
  }, [targets, storageKey]);
  return [targets, setTargets];
}
