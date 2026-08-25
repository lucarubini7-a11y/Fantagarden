import { auctionStorageKey, emptyAuction, rehydrateAuction, serializeAuction } from "./auction-state.js";

export const SESSION_SCHEMA_VERSION = 1;

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const sessionKey = (sessionId) => `fanta-auction-session-v1:${sessionId}`;
const activePointerKey = (profileId) => `fanta-auction-active-v1:${encodeURIComponent(profileId || "default")}`;
const indexKey = (profileId) => `fanta-auction-index-v1:${encodeURIComponent(profileId || "default")}`;

const newSessionId = () =>
  globalThis.crypto?.randomUUID?.() ?? `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const nowIso = () => new Date().toISOString();

const readJson = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/** Human label for the auction-session save indicator, e.g. "14:32". */
export const formatSavedAt = (iso) => {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
};

export const defaultSessionName = (date = new Date()) =>
  `Asta del ${date.toLocaleDateString("it-IT")}`;

export const isValidEnvelopeShape = (value) =>
  isObject(value) &&
  typeof value.schemaVersion === "number" &&
  typeof value.sessionId === "string" &&
  value.sessionId.length > 0 &&
  isObject(value.state) &&
  isObject(value.state.auction) &&
  Array.isArray(value.state.auction.teams) &&
  Array.isArray(value.state.auction.history);

/** A fresh, empty auction session envelope for a profile. */
export const createEnvelope = (profileId, rules, { name } = {}) => {
  const timestamp = nowIso();
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    sessionId: newSessionId(),
    profileId,
    name: name || defaultSessionName(),
    createdAt: timestamp,
    updatedAt: timestamp,
    state: {
      auction: serializeAuction(emptyAuction(rules)),
      pendingNomination: null,
    },
  };
};

/** One-time upgrade of the pre-session bare `{version,teams,history,undone}` storage. */
const migrateLegacy = (profileId) => {
  const legacy = readJson(auctionStorageKey(profileId));
  if (!legacy || !Array.isArray(legacy.teams) || !Array.isArray(legacy.history)) return null;
  const timestamp = nowIso();
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    sessionId: newSessionId(),
    profileId,
    name: defaultSessionName(),
    createdAt: timestamp,
    updatedAt: timestamp,
    state: { auction: legacy, pendingNomination: null },
  };
};

const upsertIndexEntry = (envelope) => {
  const list = readJson(indexKey(envelope.profileId));
  const entries = (Array.isArray(list) ? list : []).filter((entry) => entry?.sessionId !== envelope.sessionId);
  entries.push({
    sessionId: envelope.sessionId,
    name: envelope.name,
    createdAt: envelope.createdAt,
    updatedAt: envelope.updatedAt,
  });
  localStorage.setItem(indexKey(envelope.profileId), JSON.stringify(entries));
};

/** Sessions known for a profile (active and archived), newest first. Foundation for a future "My auctions" screen. */
export const listSessions = (profileId) => {
  const list = readJson(indexKey(profileId));
  return Array.isArray(list)
    ? list.slice().sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
    : [];
};

/**
 * Loads the active session for a profile, migrating the legacy bare format when found.
 * Never deletes or overwrites anything on disk; a schema mismatch or corrupt entry is
 * simply reported as "nothing usable" so the caller can start fresh without touching it.
 */
export const loadActiveEnvelope = (profileId) => {
  try {
    const activeId = localStorage.getItem(activePointerKey(profileId));
    if (activeId) {
      const envelope = readJson(sessionKey(activeId));
      if (
        isValidEnvelopeShape(envelope) &&
        envelope.schemaVersion === SESSION_SCHEMA_VERSION &&
        envelope.profileId === profileId
      ) {
        return { envelope, restored: true, migrated: false };
      }
    }
    const migrated = migrateLegacy(profileId);
    if (migrated) return { envelope: migrated, restored: true, migrated: true };
    return { envelope: null, restored: false, migrated: false };
  } catch {
    return { envelope: null, restored: false, migrated: false };
  }
};

/** Persists an envelope, makes it the active session for its profile, and indexes it. */
export const saveEnvelope = (envelope) => {
  try {
    localStorage.setItem(sessionKey(envelope.sessionId), JSON.stringify(envelope));
    localStorage.setItem(activePointerKey(envelope.profileId), envelope.sessionId);
    upsertIndexEntry(envelope);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || "Errore di scrittura sullo storage." };
  }
};

/** Starts a brand-new active session. The previous one is left on disk, still indexed, just no longer active. */
export const startNewSession = (profileId, rules, options) => {
  const envelope = createEnvelope(profileId, rules, options);
  return { envelope, ...saveEnvelope(envelope) };
};

export const exportEnvelope = (envelope) => JSON.stringify(envelope, null, 2);

/** Validates an imported backup without mutating any existing session. */
export const parseImportedEnvelope = (text, { profileId, players, rules }) => {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "Il file non è un JSON valido." };
  }
  if (!isObject(parsed)) return { ok: false, error: "Il file non contiene un oggetto valido." };
  if (parsed.schemaVersion !== SESSION_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Versione del formato non supportata (schemaVersion ${parsed.schemaVersion ?? "assente"}). Questa versione dell'app legge solo schemaVersion ${SESSION_SCHEMA_VERSION}.`,
    };
  }
  if (!isValidEnvelopeShape(parsed)) {
    return { ok: false, error: "Il file non ha la struttura attesa di un'esportazione asta." };
  }
  if (parsed.profileId && parsed.profileId !== profileId) {
    return { ok: false, error: "Questo backup appartiene a un'altra lega/profilo." };
  }
  if (!rehydrateAuction(parsed.state.auction, players, rules)) {
    return {
      ok: false,
      error: "Lo stato dell'asta nel file non è compatibile con le regole attuali della lega (squadre, ruoli o crediti diversi).",
    };
  }
  return { ok: true, envelope: { ...parsed, profileId } };
};

/**
 * Debounced, status-reporting writer. Coalesces bursts of changes (e.g. typing a bid)
 * into a single localStorage write after `delay` ms of inactivity.
 */
export const createAutosave = ({ delay = 400, onStatusChange } = {}) => {
  let timer = null;
  let pending = null;
  const flushNow = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!pending) return;
    const envelope = pending;
    pending = null;
    const result = saveEnvelope(envelope);
    onStatusChange?.(
      result.ok
        ? { status: "saved", at: envelope.updatedAt }
        : { status: "error", error: result.error },
    );
  };
  return {
    schedule(envelope) {
      pending = envelope;
      onStatusChange?.({ status: "pending" });
      if (timer) clearTimeout(timer);
      timer = setTimeout(flushNow, delay);
    },
    flush: flushNow,
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
    },
  };
};
