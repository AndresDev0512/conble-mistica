import { formatCurrency, formatRelativeDate } from '../utils/formatters.js';

export function renderTransactionItem(transaction, showPerson = false) {
  const { id, person, type, amount, description, date } = transaction;
  
  const personDisplayName = person === 'esmeralda' ? 'Esmeralda 💎' : 'Andrés 🚀';
  const metaText = showPerson 
    ? `${personDisplayName} · ${formatRelativeDate(date)}` 
    : formatRelativeDate(date);
    
  const amountPrefix = type === 'recuperacion' ? '+' : '-';
  const amountClass = type === 'recuperacion' ? 'text-success' : 'text-danger';

  return `
<div class="transaction-item animate-fadeInUp">
  <div class="transaction-item__left">
    <span class="transaction-item__badge transaction-item__badge--${type}"></span>
    <div class="transaction-item__info">
      <span class="transaction-item__desc">${description || 'Sin descripción'}</span>
      <span class="transaction-item__meta">${metaText}</span>
    </div>
  </div>
  <div class="transaction-item__right">
    <span class="transaction-item__amount ${amountClass}">
      ${amountPrefix}${formatCurrency(amount)}
    </span>
    <button class="transaction-item__delete" data-action="delete-transaction" data-id="${id}" aria-label="Eliminar">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  </div>
</div>
  `;
}
