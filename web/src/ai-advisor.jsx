import { playerIdKey } from "./auction-state.js";
import { contextFromAuctionState, fetchAdvisorAdvice } from "./ai-advisor-client.js";
import { AiResponseBox } from "./ai-response-box.jsx";

/**
 * Optional, on-demand extra opinion layered on top of the always-available
 * numeric advice from the Web Worker. Never called automatically - an
 * auction has ~150 nominations, and this is a paid API call per click.
 */
export function AiAdvisorPanel({ player, state, owner, price, advice, data, activeRules, apiBase }) {
  if (!player) return null;

  const onAsk = () => {
    const context = contextFromAuctionState({
      player,
      state,
      owner,
      price,
      advice,
      players: data.players,
      rules: activeRules,
    });
    return fetchAdvisorAdvice(apiBase, context);
  };

  return (
    <AiResponseBox
      askLabel="🤖 Chiedi il consiglio AI"
      ariaLabel="Consiglio AI"
      onAsk={onAsk}
      resetKey={playerIdKey(player.id)}
    />
  );
}
