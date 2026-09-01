import { useEffect, useState } from "react";
import { apiFetch, getStoredPassword, setStoredPassword } from "./api-client.js";

async function checkPassword(apiBase, password) {
  try {
    const response = await apiFetch(`${String(apiBase || "").replace(/\/$/, "")}/api/auth/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) return false;
    const body = await response.json();
    return body?.valid === true;
  } catch {
    return false;
  }
}

/**
 * Gates the whole app behind the shared password, but stays invisible when
 * the backend has none configured (APP_SHARED_PASSWORD unset - local dev,
 * Codespaces): that state is discovered by actually asking /api/auth/check
 * at startup, never assumed from a frontend-side flag.
 */
export function AuthGate({ apiBase, children }) {
  const [status, setStatus] = useState("checking");
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    checkPassword(apiBase, getStoredPassword()).then((valid) => {
      if (!cancelled) setStatus(valid ? "unlocked" : "locked");
    });
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  if (status === "checking") return null;
  if (status === "unlocked") return children;

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const valid = await checkPassword(apiBase, input);
    setSubmitting(false);
    if (valid) {
      setStoredPassword(input);
      setStatus("unlocked");
    } else {
      setError("Password errata, riprova.");
    }
  };

  return (
    <div className="auth-gate">
      <form className="auth-gate-card" onSubmit={submit}>
        <span className="eyebrow">ACCESSO RISERVATO</span>
        <h1>Password richiesta</h1>
        <p>Inserisci la password condivisa per entrare nel tool.</p>
        <label htmlFor="auth-gate-password">Password</label>
        <input
          id="auth-gate-password"
          type="password"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          autoFocus
          autoComplete="current-password"
        />
        {error && (
          <p className="auth-gate-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting || !input}>
          {submitting ? "Verifica..." : "Entra"}
        </button>
      </form>
    </div>
  );
}
