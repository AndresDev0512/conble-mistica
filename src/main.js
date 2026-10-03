import './style.css';
import { initRouter, getCurrentRoute, navigate } from './router.js';
import { subscribeToTransactions, subscribeToSyncStatus, syncPendingToFirestore, getSyncStatus, getPendingRecords, getCategories, getStats, addTransaction, updateTransaction, deleteTransaction, bulkImport } from './store.js';
import { isAppCheckActive } from './firebase.js';

import { renderHeader } from './components/header.js';
import { renderBottomNav } from './components/bottom-nav.js';
import { renderDashboard } from './components/dashboard.js';
import { renderIndividual } from './components/individual.js';
import { renderBottomSheet, openBottomSheet, closeBottomSheet } from './components/bottom-sheet.js';
import { renderTransactionForm, getFormData, resetForm, populateForm, refreshCategorySuggestions } from './components/transaction-form.js';
import { renderToastContainer, showToast } from './components/toast.js';
import { exportToJSON, importFromJSON } from './utils/export.js';
import { formatAmountInput } from './utils/formatters.js';


let allTransactions = [];
let currentStats = {};
let activeTypeFilter = 'all';
let activeCategoryFilter = 'all';

/**
 * Aplica los dos filtros a la vez. Se centraliza porque antes el filtro de tipo
 * manipulaba el display directamente y pisaba el de categoría.
 */
function applyFilters() {
  document.querySelectorAll('.transaction-item').forEach(item => {
    const type = item.dataset.type;
    const category = item.dataset.category || '';

    const typeMatches = activeTypeFilter === 'all' || type === activeTypeFilter;
    const categoryMatches = activeCategoryFilter === 'all'
      || (activeCategoryFilter === 'sin-categoria'
        ? category === ''
        : category === activeCategoryFilter);

    item.style.display = (typeMatches && categoryMatches) ? '' : 'none';
  });
}

function getActivePerson() {
  const { route, person } = getCurrentRoute();
  if (route === 'individual' && person) return person;
  return 'esmeralda';
}

function renderPage(routeObj) {
  const { route, person } = routeObj;
  const content = document.getElementById('app-content');
  if (!content) return;

  if (route === 'individual' && person) {
    content.innerHTML = renderIndividual(person, currentStats, allTransactions);
  } else {
    content.innerHTML = renderDashboard(currentStats, allTransactions);
  }

  // Update bottom nav active state
  const navItems = document.querySelectorAll('.bottom-nav__item');
  navItems.forEach(item => {
    const itemRoute = item.dataset.route;
    const isActive = (route === 'dashboard' && itemRoute === '#/dashboard') ||
                     (route === 'individual' && itemRoute === `#/${person}`);
    item.classList.toggle('bottom-nav__item--active', isActive);
  });
}

export function refreshCurrentView() {
  renderPage(getCurrentRoute());
}

/**
 * Refleja el estado de la nube en el punto del header. Antes la app informaba
 * "guardado" aunque el movimiento se hubiera quedado solo en el dispositivo.
 */
function renderSyncStatus(status) {
  const el = document.getElementById('sync-status');
  if (!el) return;

  el.dataset.state = status.state;
  el.title = status.message;
  el.setAttribute('aria-label', status.message);
}

document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app');
  if (!app) return;

  // Render app shell
  app.innerHTML = `
    <div class="app-container">
      ${renderHeader()}
      <main id="app-content" class="page-content"></main>
      ${renderBottomNav('dashboard')}
      ${renderBottomSheet(renderTransactionForm())}
      ${renderToastContainer()}
    </div>
  `;

  // Initialize router
  initRouter(renderPage);

  // App Check debe inicializarse antes de la primera peticion a Firestore
  if (isAppCheckActive()) {
    console.log('[Mistica][firebase] App Check activo (reCAPTCHA v3).');
  }

  // Subscribe to transactions (real-time with automatic persistent localStorage fallback)
  subscribeToTransactions((transactions) => {
    allTransactions = transactions;
    currentStats = getStats(transactions);
    refreshCategorySuggestions(getCategories(transactions));
    refreshCurrentView();
    applyFilters();
  });

  // Indicador de estado de sincronizacion
  subscribeToSyncStatus(renderSyncStatus);

  // Rescatar lo que quedo pendiente en este dispositivo (arranque)
  syncPendingToFirestore();

  // Al recuperar conexion, reintentar la subida de lo pendiente
  window.addEventListener('online', () => {
    showToast('Conexion recuperada, sincronizando', 'info');
    syncPendingToFirestore();
  });

  window.addEventListener('offline', () => {
    showToast('Sin conexion: los cambios se guardan en este dispositivo', 'info');
  });

  // Reintento periodico: cubre el caso en que Firebase estaba bloqueado por
  // reglas o la red fallaba al momento de guardar.
  setInterval(() => {
    if (allTransactions.some(t => !t.syncedToFirestore)) {
      syncPendingToFirestore();
    }
  }, 60000);

  // Diagnostico manual desde la consola del navegador:
  //   mistica.estado()      -> estado actual de la sincronizacion
  //   mistica.pendientes()  -> movimientos que faltan por subir
  //   mistica.sincronizar() -> forzar la subida ahora
  window.mistica = {
    estado: getSyncStatus,
    pendientes: getPendingRecords,
    sincronizar: syncPendingToFirestore,
  };

  // Handle JSON import file selection
  document.addEventListener('change', async (e) => {
    if (e.target.id !== 'import-file-input') return;
    const file = e.target.files[0];
    if (!file) return;

    console.log(`[Mistica][UI] Archivo seleccionado para importar: "${file.name}" (${file.size} bytes, tipo: ${file.type || 'desconocido'})`);

    try {
      showToast('Importando datos...', 'info');
      const imported = await importFromJSON(file);
      console.log(`[Mistica][UI] Archivo JSON leído exitosamente. Registros encontrados:`, imported.length);

      if (!Array.isArray(imported) || imported.length === 0) {
        console.warn(`[Mistica][UI] El contenido del JSON no es un arreglo válido o está vacío.`);
        showToast('El archivo no contiene un arreglo de movimientos válido', 'error');
        return;
      }

      const { imported: savedCount, skipped: skippedCount } = bulkImport(imported);

      if (savedCount === 0 && skippedCount > 0) {
        showToast(`Los ${skippedCount} movimientos ya existían en la app`, 'info');
        return;
      }

      if (savedCount === 0) {
        showToast('No se importó ningún movimiento', 'error');
        return;
      }

      // Los importados quedan pendientes; se suben de inmediato y el resto
      // se reintenta solo en los proximos arranques.
      syncPendingToFirestore();

      const msg = skippedCount > 0
        ? `${savedCount} importado(s) ✨ (${skippedCount} ya existían)`
        : `${savedCount} movimiento(s) importado(s) ✨`;

      showToast(msg, 'success');
    } catch (err) {
      console.error('[Mistica][UI] Error al procesar el archivo:', err);
      showToast('Error al leer el archivo JSON', 'error');
    }
  });

  // Global event delegation

  app.addEventListener('click', (e) => {
    const target = e.target;

    // --- Boton de nuevo registro (integrado en el bottom nav) ---
    const fab = target.closest('[data-action="open-form"]');
    if (fab) {
      const activePerson = getActivePerson();
      resetForm(activePerson);
      openBottomSheet();
      return;
    }

    // --- Close bottom sheet (cancel action) ---
    const closeSheet = target.closest('[data-action="close-sheet"]');
    if (closeSheet) {
      closeBottomSheet();
      resetForm(getActivePerson());
      return;
    }

    // --- Edit transaction ---
    const editAction = target.closest('[data-action="edit-transaction"]');
    if (editAction) {
      const id = editAction.dataset.id;
      const transactionToEdit = allTransactions.find(t => t.id === id);
      if (transactionToEdit) {
        populateForm(transactionToEdit);
        openBottomSheet();
      }
      return;
    }

    // --- Delete transaction ---
    const deleteAction = target.closest('[data-action="delete-transaction"]');
    if (deleteAction) {
      const id = deleteAction.dataset.id;
      if (id && confirm('¿Eliminar este movimiento?')) {
        deleteTransaction(id)
          .then((result) => {
            if (result?.pendingDelete) {
              showToast('Eliminado aquí, pendiente de eliminar en la nube', 'info');
            } else {
              showToast('Movimiento eliminado', 'info');
            }
          })
          .catch(() => showToast('Error al eliminar', 'error'));
      }
      return;
    }

    // --- Navigation ---
    const navAction = target.closest('[data-action="navigate"]');
    if (navAction) {
      const route = navAction.dataset.route;
      if (route) {
        navigate(route);
      }
      return;
    }

    // --- Export data ---
    const exportAction = target.closest('[data-action="export"]');
    if (exportAction) {
      if (allTransactions.length === 0) {
        showToast('No hay datos para exportar', 'info');
      } else {
        exportToJSON(allTransactions);
        showToast('Datos exportados ✨', 'success');
      }
      return;
    }

    // --- Import data ---
    const importAction = target.closest('[data-action="import"]');
    if (importAction) {
      const fileInput = document.getElementById('import-file-input');
      if (fileInput) {
        fileInput.value = ''; // reset so same file can be re-selected
        fileInput.click();
      }
      return;
    }

    // --- Filter pills ---
    const filterAction = target.closest('[data-action="filter"]');
    if (filterAction) {
      activeTypeFilter = filterAction.dataset.filter;
      document.querySelectorAll('[data-action="filter"]').forEach(p => p.classList.remove('filter-pill--active'));
      filterAction.classList.add('filter-pill--active');
      applyFilters();
      return;
    }

    // --- Filter by category ---
    const categoryFilterAction = target.closest('[data-action="filter-category"]');
    if (categoryFilterAction) {
      activeCategoryFilter = categoryFilterAction.dataset.category;
      document.querySelectorAll('[data-action="filter-category"]').forEach(p => p.classList.remove('filter-pill--active'));
      categoryFilterAction.classList.add('filter-pill--active');
      applyFilters();
      return;
    }
  });

  // Miles en vivo mientras se escribe el monto: 73000 -> 73.000
  app.addEventListener('input', (e) => {
    if (e.target.id !== 'amount') return;

    const formatted = formatAmountInput(e.target.value);
    if (e.target.value === formatted) return;

    e.target.value = formatted;
    const caret = formatted.length;
    e.target.setSelectionRange(caret, caret);
  });

  // Form submission handling
  app.addEventListener('submit', async (e) => {
    const form = e.target.closest('#transaction-form');
    if (!form) return;
    e.preventDefault();

    const data = getFormData();
    if (!data) {
      showToast('Por favor ingresa un monto válido mayor a 0', 'error');
      // Keep modal open and retain existing values for user correction
      return;
    }

    try {
      let result;
      if (data.id) {
        result = await updateTransaction(data.id, data);
      } else {
        result = await addTransaction(data);
      }

      // On success: reset form and close modal
      resetForm(getActivePerson());
      closeBottomSheet();
      if (navigator.vibrate) navigator.vibrate(50);

      // Decir la verdad: si no llego a la nube, avisarlo en vez de mentir.
      if (result?.synced) {
        showToast('Movimiento guardado y sincronizado', 'success');
      } else {
        showToast('Guardado en este dispositivo, pendiente de subir a la nube', 'info');
      }
    } catch (error) {
      console.error('[Mistica] Error guardando movimiento:', error);
      showToast('Error al guardar el movimiento', 'error');
      // Keep modal open so user does not lose typed data
    }
  });
});
