import { renderStatsCard } from './stats-card.js';
import { formatCurrency, formatRelativeDate, escapeHtml, slugifyCategory } from '../utils/formatters.js';

export function renderIndividual(personKey, stats, transactions) {
  const isEsmeralda = personKey === 'esmeralda';
  const displayName = isEsmeralda ? 'Esmeralda' : 'Andrés';
  const emoji = isEsmeralda ? '💎' : '🚀';
  const firstLetter = displayName.charAt(0);

  const personStats = stats && stats[personKey] ? stats[personKey] : {
    totalInversion: 0,
    totalRecuperacion: 0,
    balance: 0
  };

  const personTransactions = transactions ? transactions.filter(t => t.person === personKey) : [];

  const balanceType = personStats.balance >= 0 ? 'positive' : 'negative';
  
  const percent = personStats.totalInversion > 0 
    ? Math.min((personStats.totalRecuperacion / personStats.totalInversion) * 100, 100).toFixed(1) 
    : 0;

  let content = '';

  if (personTransactions.length === 0) {
    content = `
      <div class="empty-state animate-fadeInUp">
        <span class="empty-state__icon">${emoji}</span>
        <h3 class="empty-state__title">Sin movimientos</h3>
        <p class="empty-state__desc">Aún no hay registros para ${displayName}</p>
      </div>
    `;
  } else {
    // Categorias usadas por esta persona, para las pastillas de filtro.
    const categories = [...new Set(
      personTransactions
        .map(t => (t.category || '').trim())
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, 'es'));

    const hasUncategorized = personTransactions.some(t => !(t.category || '').trim());

    const categoryPills = categories.length || hasUncategorized
      ? `
        <div class="filter-pills filter-pills--category">
          <span class="filter-pills__label">Categoría</span>
          <button class="filter-pill filter-pill--active" data-action="filter-category" data-category="all">Todas</button>
          ${categories.map(c => `
            <button class="filter-pill" data-action="filter-category" data-category="${slugifyCategory(c)}">${escapeHtml(c)}</button>
          `).join('')}
          ${hasUncategorized ? '<button class="filter-pill" data-action="filter-category" data-category="sin-categoria">Sin categoría</button>' : ''}
        </div>
      `
      : '';

    content = `
      <div class="filter-pills">
        <button class="filter-pill filter-pill--active" data-action="filter" data-filter="all">Todos</button>
        <button class="filter-pill" data-action="filter" data-filter="inversion">💰 Inversiones</button>
        <button class="filter-pill" data-action="filter" data-filter="recuperacion">💵 Recuperaciones</button>
      </div>

      ${categoryPills}

      <div class="transaction-list">
        ${personTransactions.map((t, index) => {
          const isRecuperacion = t.type === 'recuperacion';
          const amountClass = isRecuperacion ? 'text-success' : 'text-danger';
          const sign = isRecuperacion ? '+' : '-';

          return `
            <div class="transaction-item animate-fadeInUp" style="animation-delay: ${index * 50}ms"
                 data-type="${t.type}" data-category="${slugifyCategory(t.category)}">
              <div class="transaction-item__left">
                <span class="transaction-item__badge transaction-item__badge--${t.type}"></span>
                <div class="transaction-item__info">
                  <span class="transaction-item__desc">${escapeHtml(t.description || 'Sin descripción')}</span>
                  <span class="transaction-item__meta">
                    ${formatRelativeDate(t.date)}
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
    `;
  }

  return `
    <div class="individual-header animate-fadeInUp">
      <div class="individual-header__avatar individual-header__avatar--${personKey}">${firstLetter}</div>
      <h2 class="individual-header__name">${emoji} ${displayName}</h2>
    </div>

    <div class="individual-stats">
      ${renderStatsCard({
        title: 'Invertido',
        value: formatCurrency(personStats.totalInversion),
        icon: '💰',
        type: 'neutral'
      })}
      ${renderStatsCard({
        title: 'Recuperado',
        value: formatCurrency(personStats.totalRecuperacion),
        icon: '💵',
        type: 'neutral'
      })}
      ${renderStatsCard({
        title: 'Balance',
        value: formatCurrency(personStats.balance),
        icon: '📊',
        type: balanceType
      })}
    </div>

    <div class="recovery-progress animate-fadeInUp delay-2">
      <div class="recovery-progress__header">
        <span>Recuperación</span>
        <span>${percent}%</span>
      </div>
      <div class="progress-bar">
        <div class="progress-bar__fill progress-bar--${personKey}" style="width: ${percent}%"></div>
      </div>
    </div>

    ${content}
  `;
}
