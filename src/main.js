import './style.css';
import { initRouter, getCurrentRoute, navigate } from './router.js';
import { subscribeToTransactions, getStats, addTransaction, deleteTransaction } from './store.js';
import { renderHeader } from './components/header.js';
import { renderBottomNav } from './components/bottom-nav.js';
import { renderDashboard } from './components/dashboard.js';
import { renderIndividual } from './components/individual.js';
import { renderFab } from './components/fab.js';
import { renderBottomSheet, openBottomSheet, closeBottomSheet } from './components/bottom-sheet.js';
import { renderTransactionForm, getFormData, resetForm } from './components/transaction-form.js';
import { renderToastContainer, showToast } from './components/toast.js';
import { exportToJSON } from './utils/export.js';

let allTransactions = [];
let currentStats = {};

function getActiveTab() {
  const { route, person } = getCurrentRoute();
  if (route === 'individual') return person;
  return 'dashboard';
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

  // Subscribe to transactions (real-time from Firebase or localStorage)
  subscribeToTransactions((transactions) => {
    allTransactions = transactions;
    currentStats = getStats(transactions);
    refreshCurrentView();
  });

  // Global event delegation
  app.addEventListener('click', (e) => {
    const target = e.target;

    // --- FAB: Open bottom sheet ---
    const fab = target.closest('[data-action="open-form"]');
    if (fab) {
      // Pre-select person if on individual view
      const { route, person } = getCurrentRoute();
      if (route === 'individual' && person) {
        const radio = document.getElementById(`person-${person}`);
        if (radio) radio.checked = true;
      }
      openBottomSheet();
      return;
    }

    // --- Close bottom sheet ---
    const closeSheet = target.closest('[data-action="close-sheet"]');
    if (closeSheet) {
      closeBottomSheet();
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

  // Form submission
  app.addEventListener('submit', async (e) => {
    const form = e.target.closest('#transaction-form');
    if (!form) return;
    e.preventDefault();

    const data = getFormData();
    if (!data) {
      showToast('Completa todos los campos', 'error');
      return;
    }

    try {
      await addTransaction(data);
      resetForm();
      closeBottomSheet();
      showToast('Movimiento guardado ✨', 'success');
      // Haptic feedback if supported
      if (navigator.vibrate) navigator.vibrate(50);
    } catch (error) {
      console.error('Error saving transaction:', error);
      showToast('Error al guardar', 'error');
    }
  });
});
