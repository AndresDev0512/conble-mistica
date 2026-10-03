/**
 * Utility functions for formatting numbers and dates in Mística Contable.
 * Configured specifically for Colombian locale (es-CO) and COP currency.
 */

// Cached Intl formatters for performance
const currencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

const fullDateFormatter = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric'
});

const shortDateFormatter = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short'
});

// Sin decimales: los montos se manejan en pesos enteros.
const amountInputFormatter = new Intl.NumberFormat('es-CO', {
  maximumFractionDigits: 0
});

/**
 * Normalizes input into a standard Date object.
 * Handles Date objects, Firestore Timestamps (with .toDate()),
 * ISO date strings, timestamps, or defaults.
 *
 * @param {Date|Object|string|number} date 
 * @returns {Date|null}
 */
function normalizeDate(date) {
  if (!date) return null;
  if (typeof date.toDate === 'function') {
    return date.toDate();
  }
  if (date instanceof Date) {
    return date;
  }
  const parsed = new Date(date);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Formats a number as Colombian Pesos (COP).
 * Example: 150000 -> '$150.000'
 *
 * @param {number|string} amount
 * @returns {string} Formatted currency string
 */
export function formatCurrency(amount) {
  const numericAmount = typeof amount === 'number' && !isNaN(amount)
    ? amount
    : (Number(amount) || 0);

  return currencyFormatter.format(numericAmount);
}

/**
 * Formatea lo que el usuario escribe en el campo de monto, para que vea
 * '73.000' en vez de '73000'. Solo conserva digitos, asi que se puede usar
 * sobre el valor actual sin volver a formatear.
 *
 * @param {string|number} raw
 * @returns {string} e.g. '73.000'
 */
export function formatAmountInput(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  return amountInputFormatter.format(Number(digits));
}

/**
 * Convierte el texto del campo de monto en un numero. Tolera el punto de miles
 * que formatAmountInput agrega: '73.000' -> 73000.
 *
 * @param {string|number} raw
 * @returns {number}
 */
export function parseAmountInput(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits ? Number(digits) : 0;
}

/**
 * Escapa texto que se va a insertar como HTML. Los datos del usuario (descripcion,
 * categoria) se renderizan con innerHTML, asi que sin esto un texto con '<' o
 * '>' romperia el marcado.
 *
 * @param {*} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Version segura de una categoria para usarla como valor de atributo
 * data-*. Quita acentos y espacios: 'Ropa de cama' -> 'ropa-de-cama'.
 *
 * @param {*} value
 * @returns {string}
 */
export function slugifyCategory(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Formats a Date or Firestore Timestamp into a Spanish date string.
 * Uses locale 'es-CO' with day: 'numeric', month: 'short', year: 'numeric'.
 * Example: '21 sept 2026'
 *
 * @param {Date|Object|string|number} date
 * @returns {string} Formatted date string
 */
export function formatDate(date) {
  const d = normalizeDate(date);
  if (!d) return '';
  return fullDateFormatter.format(d).replace(/\./g, '');
}

/**
 * Formats a Date or Firestore Timestamp into a shorter Spanish date string.
 * Uses locale 'es-CO' with day: 'numeric', month: 'short'.
 * Example: '21 sept'
 *
 * @param {Date|Object|string|number} date
 * @returns {string} Formatted short date string
 */
export function formatDateShort(date) {
  const d = normalizeDate(date);
  if (!d) return '';
  return shortDateFormatter.format(d).replace(/\./g, '');
}

/**
 * Returns a relative date label: 'Hoy' for today, 'Ayer' for yesterday,
 * or the formatted full date otherwise. Handles Firestore Timestamps.
 *
 * @param {Date|Object|string|number} date
 * @returns {string} 'Hoy', 'Ayer', or formatted date
 */
export function formatRelativeDate(date) {
  const d = normalizeDate(date);
  if (!d) return '';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const diffTime = today.getTime() - target.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Hoy';
  }
  if (diffDays === 1) {
    return 'Ayer';
  }

  return formatDate(d);
}

/**
 * Converts a Date to 'YYYY-MM-DD' format suitable for HTML date inputs.
 * If no date passed, defaults to today.
 *
 * @param {Date|Object|string|number} [date]
 * @returns {string} Date string in 'YYYY-MM-DD' format
 */
export function getDateInputValue(date) {
  const target = date ? normalizeDate(date) : new Date();
  const d = target || new Date();

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}
