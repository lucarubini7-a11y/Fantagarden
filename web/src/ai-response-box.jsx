import { useEffect, useRef, useState } from "react";

const UNAVAILABLE_MESSAGES = {
  missing_api_key: "Consiglio AI non configurato.",
  network_error: "Consiglio AI non raggiungibile: rete lenta o assente.",
  http_error: "Consiglio AI non disponibile al momento.",
  api_error: "Consiglio AI non disponibile al momento.",
};

/**
 * Shared idle/loading/success/unavailable state machine for an on-demand
 * AI opinion box. Used by both the per-candidate AI advisor
 * (ai-advisor.jsx) and the "who's the best pick" button in
 * nomination-suggestions.jsx, so the two stay visually and behaviorally
 * identical instead of drifting apart.
 *
 * `onAsk` must resolve to the same {status, advice|reason} shape
 * fetchAdvisorAdvice returns. `resetKey` clears any previous answer
 * whenever the thing being asked about changes underneath (a newly
 * selected candidate, a refreshed suggestion set).
 */
export function AiResponseBox({ askLabel, ariaLabel, onAsk, resetKey }) {
  const [status, setStatus] = useState("idle");
  const [text, setText] = useState("");
  const disabledForSession = useRef(false);
  const lastResetKey = useRef(resetKey);

  useEffect(() => {
    if (resetKey === lastResetKey.current) return;
    lastResetKey.current = resetKey;
    setText("");
    setStatus("idle");
  }, [resetKey]);

  const ask = async () => {
    setStatus("loading");
    const outcome = await onAsk();
    if (outcome.status === "success") {
      setText(outcome.advice);
      setStatus("success");
      return;
    }
    if (outcome.reason === "missing_api_key") disabledForSession.current = true;
    setText(UNAVAILABLE_MESSAGES[outcome.reason] || UNAVAILABLE_MESSAGES.api_error);
    setStatus("unavailable");
  };

  return (
    <section className="ai-advisor-panel" aria-label={ariaLabel}>
      {status === "idle" && (
        <button
          type="button"
          onClick={ask}
          disabled={disabledForSession.current}
          title={disabledForSession.current ? "Consiglio AI non configurato" : undefined}
        >
          {askLabel}
        </button>
      )}
      {status === "loading" && (
        <p className="ai-advisor-loading" role="status">
          Sto pensando...
        </p>
      )}
      {status === "success" && (
        <div className="ai-advisor-result">
          <span className="ai-advisor-icon" aria-hidden="true">
            🤖
          </span>
          <p>{text}</p>
          <button type="button" className="ai-advisor-retry" onClick={ask}>
            Chiedi di nuovo
          </button>
        </div>
      )}
      {status === "unavailable" && (
        <p className="ai-advisor-unavailable" role="status">
          {text}
          {!disabledForSession.current && (
            <button type="button" className="ai-advisor-retry" onClick={ask}>
              Riprova
            </button>
          )}
        </p>
      )}
    </section>
  );
}
