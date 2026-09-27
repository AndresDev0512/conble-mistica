import { getDateInputValue } from '../utils/formatters.js';

export function renderTransactionForm(defaultPerson = null) {
  const isEsmeralda = defaultPerson === 'esmeralda' || defaultPerson === null;
  const isAndres = defaultPerson === 'andres';
  
  return `
<form id="transaction-form" class="transaction-form">
  <h3 class="transaction-form__title">Nuevo Movimiento</h3>
  
  <!-- Type Toggle -->
  <div class="form-group">
    <label class="form-label">Tipo</label>
    <div class="form-toggle">
      <input type="radio" name="type" value="inversion" id="type-inversion" checked>
      <label for="type-inversion" class="form-toggle__option">
        <span>💰</span> Inversión
      </label>
      <input type="radio" name="type" value="recuperacion" id="type-recuperacion">
      <label for="type-recuperacion" class="form-toggle__option">
        <span>💵</span> Recuperación
      </label>
    </div>
  </div>

  <!-- Amount -->
  <div class="form-group">
    <label class="form-label" for="amount">Monto ($)</label>
    <input type="text" inputmode="decimal" id="amount" name="amount" class="form-input form-input--amount" placeholder="0" required autocomplete="off">
  </div>

  <!-- Description -->
  <div class="form-group">
    <label class="form-label" for="description">Descripción</label>
    <input type="text" id="description" name="description" class="form-input" placeholder="¿En qué se invirtió/recuperó?" autocomplete="off">
  </div>

  <!-- Date -->
  <div class="form-group">
    <label class="form-label" for="date">Fecha</label>
    <input type="date" id="date" name="date" class="form-input" value="${getDateInputValue()}" required>
  </div>

  <!-- Person selector -->
  <div class="form-group">
    <label class="form-label">Persona</label>
    <div class="form-toggle">
      <input type="radio" name="person" value="esmeralda" id="person-esmeralda" ${isEsmeralda ? 'checked' : ''}>
      <label for="person-esmeralda" class="form-toggle__option">
        <span>💎</span> Esmeralda
      </label>
      <input type="radio" name="person" value="andres" id="person-andres" ${isAndres ? 'checked' : ''}>
      <label for="person-andres" class="form-toggle__option">
        <span>🚀</span> Andrés
      </label>
    </div>
  </div>

  <!-- Submit -->
  <button type="submit" class="btn btn--primary btn--full">
    Guardar Movimiento ✨
  </button>
</form>
  `;
}

export function getFormData() {
  const form = document.getElementById('transaction-form');
  if (!form) return null;

  const type = form.querySelector('input[name="type"]:checked')?.value;
  const amountStr = form.querySelector('#amount').value;
  const description = form.querySelector('#description').value;
  const date = form.querySelector('#date').value;
  const person = form.querySelector('input[name="person"]:checked')?.value;

  const amount = parseFloat(amountStr.replace(/[^0-9.]/g, ''));

  if (!amount || amount <= 0 || !person || !type || !date) {
    return null;
  }

  return {
    type,
    amount,
    description: description.trim(),
    date,
    person
  };
}

export function resetForm() {
  const form = document.getElementById('transaction-form');
  if (!form) return;

  const typeInversion = form.querySelector('#type-inversion');
  if (typeInversion) typeInversion.checked = true;

  const amount = form.querySelector('#amount');
  if (amount) amount.value = '';

  const description = form.querySelector('#description');
  if (description) description.value = '';

  const date = form.querySelector('#date');
  if (date) date.value = getDateInputValue();
}
