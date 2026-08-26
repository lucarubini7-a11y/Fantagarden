import { useMemo } from "react";
import { suggestNominations } from "./nomination-advisor.js";
import { contextFromNominationSuggestions, fetchAdvisorAdvice } from "./ai-advisor-client.js";
import { AiResponseBox } from "./ai-response-box.jsx";
import { TeamBadge } from "./team-badge.jsx";

const SIGNAL_BADGES = {
  readyTarget: { icon: "🎯", label: "obiettivo pronto" },
  decoy: { icon: "🪤", label: "esca" },
  hiddenGem: { icon: "💎", label: "occasione" },
};

/**
 * Complementary to AiAdvisorPanel: that one judges whether to buy the
 * player someone else just nominated, this one is about the initiative of
 * calling the next name yourself. Always on (recomputed from live state,
 * no button needed for the local part) - the AI opinion on top stays
 * opt-in, same as the rest of the AI advisor.
 */
export function NominationSuggestions({
  availablePlayers,
  watchlist,
  myTeam,
  opponentTeams,
  budgetPlan,
  apiBase,
}) {
  const suggestions = useMemo(
    () => suggestNominations({ watchlist, availablePlayers, myTeam, opponentTeams, budgetPlan }),
    [watchlist, availablePlayers, myTeam, opponentTeams, budgetPlan],
  );
  const resetKey = suggestions.map((entry) => entry.player.id).join(",");

  const onAsk = () => {
    const context = contextFromNominationSuggestions({ suggestions, myTeam, opponentTeams });
    return fetchAdvisorAdvice(apiBase, context);
  };

  return (
    <details className="nomination-suggestions" open>
      <summary>Chi chiamo adesso?</summary>
      {suggestions.length === 0 ? (
        <p className="nomination-suggestions-empty">
          Nessun suggerimento al momento: aggiungi qualche obiettivo o aspetta che il mercato si muova.
        </p>
      ) : (
        <>
          <ul className="nomination-suggestions-list">
            {suggestions.map(({ player, reasons, primarySignal }) => {
              const badge = SIGNAL_BADGES[primarySignal];
              return (
                <li key={player.id} className="nomination-suggestion-row">
                  <i className={"role " + player.ruolo}>{player.ruolo}</i>
                  <span className="nomination-suggestion-name">
                    <b>{player.nome}</b>
                    <small>
                      <TeamBadge team={player.squadra} size={14} /> {player.squadra}
                    </small>
                  </span>
                  <span
                    className={`nomination-signal-badge nomination-signal-${primarySignal}`}
                    title={reasons.join(" ")}
                  >
                    {badge.icon} {badge.label}
                  </span>
                </li>
              );
            })}
          </ul>
          <AiResponseBox
            askLabel="🤖 Qual è la scelta migliore?"
            ariaLabel="Consiglio AI su chi chiamare"
            onAsk={onAsk}
            resetKey={resetKey}
          />
        </>
      )}
    </details>
  );
}
