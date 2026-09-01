const PASSWORD_STORAGE_KEY = "fanta-app-password";

/** Read the shared password saved by AuthGate, or "" if none/unavailable. */
export function getStoredPassword() {
  try {
    return localStorage.getItem(PASSWORD_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

/** Persist (or clear, when password is falsy) the shared password. */
export function setStoredPassword(password) {
  try {
    if (password) localStorage.setItem(PASSWORD_STORAGE_KEY, password);
    else localStorage.removeItem(PASSWORD_STORAGE_KEY);
  } catch {
    // localStorage unavailable (private mode, storage quota, ...) - nothing to persist.
  }
}

/**
 * Drop-in replacement for fetch() against this app's API: attaches the
 * shared-password Authorization header when one is stored, no-op otherwise
 * (matching the backend, which only enforces it when APP_SHARED_PASSWORD is
 * configured). Every direct call to the local API should go through this
 * instead of the global fetch, so the header never has to be repeated.
 */
export function apiFetch(url, options = {}) {
  const password = getStoredPassword();
  if (!password) return fetch(url, options);
  return fetch(url, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${password}` },
  });
}
