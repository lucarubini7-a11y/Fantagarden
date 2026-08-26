export const DRAFT_STORAGE_PREFIX = "fanta-settings-draft-";

export const draftStorageKey = (profileId) => `${DRAFT_STORAGE_PREFIX}${profileId || "new"}`;

/** Reads a saved settings draft for a profile, or null if absent/corrupt. */
export function readDraft(profileId) {
  try {
    const raw = localStorage.getItem(draftStorageKey(profileId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && parsed.profile && parsed.savedAt
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/** Best-effort write; a full or unavailable storage must never break editing. */
export function writeDraft(profileId, profile) {
  try {
    localStorage.setItem(
      draftStorageKey(profileId),
      JSON.stringify({ savedAt: new Date().toISOString(), profile }),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(profileId) {
  try {
    localStorage.removeItem(draftStorageKey(profileId));
  } catch {
    /* best effort */
  }
}
