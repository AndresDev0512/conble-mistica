import { renderStatsCard } from './stats-card.js';
import { formatCurrency, formatDate, escapeHtml, slugifyCategory } from '../utils/formatters.js';

export function renderDashboard(stats, transactions) {
  if (!stats || !transactions || transactions.length === 0) {
    return `
      <div class="empty-state animate-fadeInUp">
        <span class="empty-state__icon">🔮</span>
        <h3 class="empty-state__title">¡Bienvenidos a Mística Contable!</h3>
        <p class="empty-state__desc">Toca el botón + para registrar tu primer movimiento</p>
      </div>
    `;
  }

  const { combined } = stats;
  const balanceType = combined.balance >= 0 ? 'positive' : 'negative';

  const esmeraldaPercent = stats.esmeralda.totalInversion > 0 
    ? Math.min((stats.esmeralda.totalRecuperacion / stats.esmeralda.totalInversion) * 100, 100).toFixed(1) 
    : 0;
  
  const andresPercent = stats.andres.totalInversion > 0 
    ? Math.min((stats.andres.totalRecuperacion / stats.andres.totalInversion) * 100, 100).toFixed(1) 
    : 0;

  const esmeraldaBalanceClass = stats.esmeralda.balance >= 0 ? 'text-success' : 'text-danger';
  const andresBalanceClass = stats.andres.balance >= 0 ? 'text-success' : 'text-danger';

  const recentTransactions = transactions.slice(0, 5);

  const getPersonDetails = (person) => {
    if (person === 'esmeralda') return { name: 'Esmeralda', emoji: '💎' };
    if (person === 'andres') return { name: 'Andrés', emoji: '🚀' };
    return { name: person, emoji: '👤' };
  };

  return `
    <div class="dashboard-summary">
      ${renderStatsCard({
        title: 'Total Invertido',
        value: formatCurrency(combined.totalInversion),
        icon: '💰',
        type: 'neutral'
      })}
      ${renderStatsCard({
        title: 'Total Recuperado',
        value: formatCurrency(combined.totalRecuperacion),
        icon: '💵',
        type: 'neutral'
      })}
      ${renderStatsCard({
        title: 'Balance General',
        value: formatCurrency(combined.balance),
        icon: '📊',
        type: balanceType
      })}
    </div>

    <section class="comparison">
      <h3 class="section-title">Comparativa</h3>
      
      <div class="person-card" data-action="navigate" data-route="#/esmeralda">
        <div class="person-card__avatar person-card__avatar--esmeralda">E</div>
        <div class="person-card__info">
          <span class="person-card__name">Esmeralda 💎</span>
          <span class="person-card__balance ${esmeraldaBalanceClass}">${formatCurrency(stats.esmeralda.balance)}</span>
        </div>
        <div class="person-card__bars">
          <div class="progress-bar">
            <div class="progress-bar__fill progress-bar--esmeralda" style="width: ${esmeraldaPercent}%"></div>
          </div>
          <span class="progress-bar__text">${esmeraldaPercent}%</span>
        </div>
      </div>

      <div class="person-card" data-action="navigate" data-route="#/andres">
        <div class="person-card__avatar person-card__avatar--andres">A</div>
        <div class="person-card__info">
          <span class="person-card__name">Andrés 🚀</span>
          <span class="person-card__balance ${andresBalanceClass}">${formatCurrency(stats.andres.balance)}</span>
        </div>
        <div class="person-card__bars">
          <div class="progress-bar">
            <div class="progress-bar__fill progress-bar--andres" style="width: ${andresPercent}%"></div>
          </div>
          <span class="progress-bar__text">${andresPercent}%</span>
        </div>
      </div>
    </section>

    <section class="recent-movements">
      <h3 class="section-title">Movimientos Recientes</h3>
      <div class="transaction-list">
        ${recentTransactions.map(t => {
          const personDetails = getPersonDetails(t.person);
          const isRecuperacion = t.type === 'recuperacion';
          const amountClass = isRecuperacion ? 'text-success' : 'text-danger';
          const sign = isRecuperacion ? '+' : '-';
          
          return `
            <div class="transaction-item" data-type="${t.type}" data-category="${slugifyCategory(t.category)}">
              <div class="transaction-item__left">
                <span class="transaction-item__badge transaction-item__badge--${t.type}">${personDetails.emoji}</span>
                <div class="transaction-item__info">
                  <span class="transaction-item__desc">${escapeHtml(t.description || 'Sin descripción')}</span>
                  <span class="transaction-item__meta">
                    ${personDetails.name} · ${formatDate(t.date)}
                    ${t.category ? `<span class="transaction-item__category">${escapeHtml(t.category)}</span>` : ''}
                  </span>
                </div>
              </div>
              <div class="transaction-item__right">
                <span class="transaction-item__amount ${amountClass}">
                  ${sign}${formatCurrency(t.amount)}
                </span>
                <button class="transaction-item__edit" data-action="edit-transaction" data-id="${t.id}" aria-label="Editar">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button class="transaction-item__delete" data-action="delete-transaction" data-id="${t.id}" aria-label="Eliminar">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </section>
  `;
}
