import { useEffect, useRef, useState } from "react";
import { playerIdKey } from "./auction-state.js";
import { contextFromAuctionState, fetchAdvisorAdvice } from "./ai-advisor-client.js";

const UNAVAILABLE_MESSAGES = {
  missing_api_key: "Consiglio AI non configurato.",
  network_error: "Consiglio AI non raggiungibile: rete lenta o assente.",
  http_error: "Consiglio AI non disponibile al momento.",
  api_error: "Consiglio AI non disponibile al momento.",
};

/**
 * Optional, on-demand extra opinion layered on top of the always-available
 * numeric advice from the Web Worker. Never called automatically - an
 * auction has ~150 nominations, and this is a paid API call per click.
 */
export function AiAdvisorPanel({ player, state, owner, price, advice, data, activeRules, apiBase }) {
  const [status, setStatus] = useState("idle");
  const [text, setText] = useState("");
  const disabledForSession = useRef(false);
  const lastPlayerId = useRef(null);

  useEffect(() => {
    const id = player ? playerIdKey(player.id) : null;
    if (id === lastPlayerId.current) return;
    lastPlayerId.current = id;
    setText("");
    setStatus("idle");
  }, [player]);

  if (!player) return null;

  const ask = async () => {
    setStatus("loading");
    const context = contextFromAuctionState({
      player,
      state,
      owner,
      price,
      advice,
      players: data.players,
      rules: activeRules,
    });
    const outcome = await fetchAdvisorAdvice(apiBase, context);
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
    <section className="ai-advisor-panel" aria-label="Consiglio AI">
      {status === "idle" && (
        <button
          type="button"
          onClick={ask}
          disabled={disabledForSession.current}
          title={disabledForSession.current ? "Consiglio AI non configurato" : undefined}
        >
          🤖 Chiedi il consiglio AI
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
