export function renderStatsCard({ title, value, icon, type }) {
  return `
    <div class="stats-card stats-card--${type} animate-fadeInUp">
      <div class="stats-card__header">
        <span class="stats-card__icon">${icon}</span>
        <span class="stats-card__label">${title}</span>
      </div>
      <div class="stats-card__value">${value}</div>
    </div>
  `;
}
