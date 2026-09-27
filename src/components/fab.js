export function renderFab() {
  return `
    <div class="fab-container">
      <button class="fab" data-action="open-form" aria-label="Agregar movimiento">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        <span class="fab-text">Nuevo Registro</span>
      </button>
    </div>
  `;
}
