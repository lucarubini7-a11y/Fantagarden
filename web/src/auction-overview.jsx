import { ROLE_LABELS } from "./role-labels.js";
import { Skeleton } from "./skeleton.jsx";

/** Live per-role budget plan ("Prossime mosse") computed by simulation.worker.js for the user's own team. */
export function AuctionOverview({ overview }) {
  if (!overview) {
    return (
      <section className="strategy-overview" aria-busy="true" aria-label="Piano strategico in calcolo">
        <div className="overview-heading">
          <div>
            <span className="eyebrow">PIANO AGGIORNATO</span>
            <h2>Prossime mosse</h2>
          </div>
          <div className="spendable">
            <Skeleton width={70} height={28} />
          </div>
        </div>
        <div className="priority-grid">
          {["P", "D", "C", "A"].map((role) => (
            <article className="priority" key={role}>
              <Skeleton width="60%" height={14} />
              <Skeleton width="40%" height={22} style={{ marginTop: 12 }} />
              <Skeleton width="90%" height={12} style={{ marginTop: 10 }} />
            </article>
          ))}
        </div>
      </section>
    );
  }
  return (
    <section
      className="strategy-overview"
      aria-label="Piano strategico della mia squadra"
    >
      <div className="overview-heading">
        <div>
          <span className="eyebrow">PIANO AGGIORNATO</span>
          <h2>Prossime mosse</h2>
        </div>
        <div className="spendable">
          <span>Budget spendibile</span>
          <strong>{overview.summary.spendableCredits}</strong>
          <small>
            + {overview.summary.reservedCredits} riservati agli slot
          </small>
        </div>
      </div>
      <div className="priority-grid">
        {overview.priorities.map((priority) => {
          const plan = overview.rolePlan[priority.role];
          return (
            <article
              className={`priority ${priority.urgency.toLowerCase()}`}
              key={priority.role}
            >
              <div>
                <span className={`role ${priority.role}`}>{priority.role}</span>
                <b>{ROLE_LABELS[priority.role]}</b>
                <em>{priority.urgency}</em>
              </div>
              <strong>
                {plan.budgetTarget}
                <small> crediti obiettivo</small>
              </strong>
              <p>{priority.reason}</p>
            </article>
          );
        })}
      </div>
      <p className="market-line">
        Mercato rilevato: <b>{overview.summary.marketInflation.toFixed(2)}x</b>{" "}
        rispetto ai valori base. Il piano si aggiorna dopo ogni assegnazione.
      </p>
    </section>
  );
}
