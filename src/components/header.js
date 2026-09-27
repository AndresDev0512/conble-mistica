export function renderHeader() {
  return `
    <header class="app-header">
      <div class="app-header__logo">
        <span class="app-header__icon">🔮</span>
        <h1 class="app-header__title">Mística Contable</h1>
      </div>
      <button class="btn btn--ghost app-header__export" data-action="export" aria-label="Exportar datos">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </button>
    </header>
  `;
}
