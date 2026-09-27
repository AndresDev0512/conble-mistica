import { formatCurrency, formatDate } from './formatters.js';

/**
 * Helper to trigger file download in the browser.
 * Uses a temporary <a> element and URL.createObjectURL.
 *
 * @param {Blob} blob
 * @param {string} filename
 */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Helper to get today's date in 'YYYY-MM-DD' format.
 *
 * @returns {string}
 */
function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Exports transactions to a pretty-printed JSON file (2-space indent)
 * and triggers download as 'mistica-contable-backup-YYYY-MM-DD.json'.
 *
 * @param {Array<Object>} transactions
 */
export function exportToJSON(transactions) {
  const data = Array.isArray(transactions) ? transactions : [];
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
  const filename = `mistica-contable-backup-${getTodayDateString()}.json`;
  downloadBlob(blob, filename);
}

/**
 * Exports transactions to a CSV file with headers:
 * Persona,Tipo,Monto,Descripción,Fecha
 *
 * Uses formatCurrency for amounts and formatDate for dates.
 * Wraps descriptions in quotes if they contain commas or special characters.
 * Triggers download as 'mistica-contable-YYYY-MM-DD.csv'.
 *
 * @param {Array<Object>} transactions
 */
export function exportToCSV(transactions) {
  const data = Array.isArray(transactions) ? transactions : [];
  const headers = ['Persona', 'Tipo', 'Monto', 'Descripción', 'Fecha'];

  const rows = data.map((t) => {
    const person = t.person || t.Persona || '';
    const type = t.type || t.Tipo || '';
    const amount = t.amount !== undefined ? t.amount : (t.Monto !== undefined ? t.Monto : 0);
    const rawDesc = t.description !== undefined ? t.description : (t.Descripción !== undefined ? t.Descripción : (t.descripcion || ''));
    const date = t.date !== undefined ? t.date : t.Fecha;

    const formattedAmount = formatCurrency(amount);
    const formattedDate = formatDate(date);

    // Escape and quote description if it contains commas, quotes, or newlines
    const descStr = rawDesc != null ? String(rawDesc) : '';
    const escapedDesc = (descStr.includes(',') || descStr.includes('"') || descStr.includes('\n') || descStr.includes('\r'))
      ? `"${descStr.replace(/"/g, '""')}"`
      : descStr;

    // Handle potential commas in formatted amount if any
    const safeAmount = (formattedAmount.includes(',') || formattedAmount.includes('"'))
      ? `"${formattedAmount.replace(/"/g, '""')}"`
      : formattedAmount;

    return [person, type, safeAmount, escapedDesc, formattedDate].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\n');
  // Include UTF-8 BOM so Excel properly handles Spanish accents and characters
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const filename = `mistica-contable-${getTodayDateString()}.csv`;
  downloadBlob(blob, filename);
}

/**
 * Reads a JSON file via FileReader, parses JSON, and returns a Promise
 * that resolves with the parsed transactions array after validating it is an array.
 *
 * @param {File} file
 * @returns {Promise<Array<Object>>}
 */
export function importFromJSON(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No se ha proporcionado ningún archivo.'));
      return;
    }

    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const text = event.target.result;
        const parsed = JSON.parse(text);

        if (!Array.isArray(parsed)) {
          reject(new Error('El contenido del archivo no es un arreglo válido de transacciones.'));
          return;
        }

        resolve(parsed);
      } catch (error) {
        reject(new Error(`Error al analizar el archivo JSON: ${error.message}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('Error al leer el archivo.'));
    };

    reader.readAsText(file);
  });
}
