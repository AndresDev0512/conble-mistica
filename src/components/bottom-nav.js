export function renderBottomNav(activeRoute) {
  return `
    <nav class="bottom-nav">
      <button class="bottom-nav__item ${activeRoute === 'dashboard' ? 'bottom-nav__item--active' : ''}" data-action="navigate" data-route="#/dashboard">
        <span class="bottom-nav__icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="4" y="12" width="4" height="8" rx="1"/>
            <rect x="10" y="8" width="4" height="12" rx="1"/>
            <rect x="16" y="4" width="4" height="16" rx="1"/>
          </svg>
        </span>
        <span class="bottom-nav__label">Ambos</span>
      </button>
      <button class="bottom-nav__item ${activeRoute === 'esmeralda' ? 'bottom-nav__item--active' : ''}" data-action="navigate" data-route="#/esmeralda">
        <span class="bottom-nav__icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 12l10 10 10-10L12 2z"/>
          </svg>
        </span>
        <span class="bottom-nav__label">Esmeralda</span>
      </button>
      <button class="bottom-nav__fab" data-action="open-form" aria-label="Nuevo registro">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
      <button class="bottom-nav__item ${activeRoute === 'andres' ? 'bottom-nav__item--active' : ''}" data-action="navigate" data-route="#/andres">
        <span class="bottom-nav__icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
            <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
            <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 3 0 3 0"/>
            <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-3 0-3"/>
          </svg>
        </span>
        <span class="bottom-nav__label">Andrés</span>
      </button>
    </nav>
  `;
}
