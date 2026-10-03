import './style.css';
import { initRouter, getCurrentRoute, navigate } from './router.js';
import { subscribeToTransactions, getStats, addTransaction, updateTransaction, deleteTransaction } from './store.js';
import { renderHeader } from './components/header.js';
import { renderBottomNav } from './components/bottom-nav.js';
import { renderDashboard } from './components/dashboard.js';
import { renderIndividual } from './components/individual.js';
import { renderFab } from './components/fab.js';
import { renderBottomSheet, openBottomSheet, closeBottomSheet } from './components/bottom-sheet.js';
import { renderTransactionForm, getFormData, resetForm, populateForm } from './components/transaction-form.js';
import { renderToastContainer, showToast } from './components/toast.js';
import { exportToJSON, importFromJSON } from './utils/export.js';


let allTransactions = [];
let currentStats = {};

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

document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app');
  if (!app) return;

  // Render app shell
  app.innerHTML = `
    <div class="app-container">
      ${renderHeader()}
      <main id="app-content" class="page-content"></main>
      ${renderFab()}
      ${renderBottomNav('dashboard')}
      ${renderBottomSheet(renderTransactionForm())}
      ${renderToastContainer()}
    </div>
  `;

  // Initialize router
  initRouter(renderPage);

  // Subscribe to transactions (real-time with automatic persistent localStorage fallback)
  subscribeToTransactions((transactions) => {
    allTransactions = transactions;
    currentStats = getStats(transactions);
    refreshCurrentView();
  });

  // Handle JSON import file selection
  document.addEventListener('change', async (e) => {
    if (e.target.id !== 'import-file-input') return;
    const file = e.target.files[0];
    if (!file) return;

    /**
     * Normalizes any date format from an exported JSON to an ISO date string (YYYY-MM-DD).
     * Handles:
     *  - Firestore Timestamp object: { seconds, nanoseconds } or { type: "firestore/timestamp/1.0", seconds, nanoseconds }
     *  - ISO string: "2026-09-29T..."
     *  - Plain date string: "2026-09-29"
     */
    function normalizeDateToISO(rawDate) {
      if (!rawDate) return new Date().toISOString().slice(0, 10);

      // Firestore Timestamp object (exported via JSON.stringify)
      if (typeof rawDate === 'object' && rawDate.seconds !== undefined) {
        const ms = rawDate.seconds * 1000 + Math.floor((rawDate.nanoseconds || 0) / 1e6);
        const d = new Date(ms);
        return d.toISOString().slice(0, 10);
      }

      // Already a string
      if (typeof rawDate === 'string') {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
      }

      // Numeric timestamp (ms)
      if (typeof rawDate === 'number') {
        return new Date(rawDate).toISOString().slice(0, 10);
      }

      return new Date().toISOString().slice(0, 10);
    }

    try {
      showToast('Importando datos...', 'info');
      const imported = await importFromJSON(file);

      if (!Array.isArray(imported) || imported.length === 0) {
        showToast('El archivo no contiene movimientos válidos', 'error');
        return;
      }

      // Prevent duplicates: filter out IDs already present
      const existingIds = new Set(allTransactions.map(t => t.id));
      const newItems = imported.filter(t => t.id && !existingIds.has(t.id));
      const duplicates = imported.length - newItems.length;

      if (newItems.length === 0) {
        showToast(`Todos los registros ya existen (${duplicates} duplicados omitidos)`, 'info');
        return;
      }

      // Save each new item, normalizing the date first
      let saved = 0;
      let errors = 0;
      for (const item of newItems) {
        try {
          const normalizedDate = normalizeDateToISO(item.date);
          await addTransaction({
            person: item.person,
            type: item.type,
            amount: Number(item.amount),
            description: item.description || '',
            date: normalizedDate
          });
          saved++;
        } catch (err) {
          errors++;
          console.warn('[Mistica][import] Error al importar registro:', item.id, err.message);
        }
      }

      if (saved === 0) {
        showToast('No se pudo importar ningún registro. Revisa el archivo.', 'error');
        return;
      }

      const parts = [];
      if (saved > 0) parts.push(`${saved} importado(s) ✨`);
      if (duplicates > 0) parts.push(`${duplicates} duplicado(s) omitido(s)`);
      if (errors > 0) parts.push(`${errors} con error`);
      showToast(parts.join(' · '), saved > 0 ? 'success' : 'error');
    } catch (err) {
      console.error('[Mistica][import] Error al procesar el archivo:', err);
      showToast('Error al leer el archivo JSON', 'error');
    }
  });

  // Global event delegation

  app.addEventListener('click', (e) => {
    const target = e.target;

    // --- FAB: Open creation form ---
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
          .then(() => showToast('Movimiento eliminado', 'info'))
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
      const filter = filterAction.dataset.filter;
      const pills = document.querySelectorAll('.filter-pill');
      pills.forEach(p => p.classList.remove('filter-pill--active'));
      filterAction.classList.add('filter-pill--active');

      const items = document.querySelectorAll('.transaction-item');
      items.forEach(item => {
        if (filter === 'all') {
          item.style.display = '';
        } else {
          const badge = item.querySelector('.transaction-item__badge');
          if (badge) {
            const isMatch = badge.classList.contains(`transaction-item__badge--${filter}`);
            item.style.display = isMatch ? '' : 'none';
          }
        }
      });
      return;
    }
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
      if (data.id) {
        await updateTransaction(data.id, data);
        showToast('Movimiento actualizado ✨', 'success');
      } else {
        await addTransaction(data);
        showToast('Movimiento guardado ✨', 'success');
      }
      // On success: reset form and close modal
      resetForm(getActivePerson());
      closeBottomSheet();
      if (navigator.vibrate) navigator.vibrate(50);
    } catch (error) {
      console.error('[Mistica] Error guardando movimiento:', error);
      showToast('Error al guardar el movimiento', 'error');
      // Keep modal open so user does not lose typed data
    }
  });
});
