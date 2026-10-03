import { getDateInputValue } from '../utils/formatters.js';

export function renderTransactionForm(defaultPerson = null, editingTransaction = null) {
  const isEditing = !!editingTransaction;
  const person = isEditing ? editingTransaction.person : (defaultPerson || 'esmeralda');
  const isEsmeralda = person === 'esmeralda';
  const isAndres = person === 'andres';
  const type = isEditing ? editingTransaction.type : 'inversion';
  const amount = isEditing ? editingTransaction.amount : '';
  const description = isEditing ? (editingTransaction.description || '') : '';
  const dateValue = isEditing && editingTransaction.date 
    ? getDateInputValue(editingTransaction.date) 
    : getDateInputValue();

  return `
<form id="transaction-form" class="transaction-form">
  <input type="hidden" id="editing-id" value="${isEditing ? editingTransaction.id : ''}">
  <h3 class="transaction-form__title" id="form-title">${isEditing ? 'Editar Movimiento' : 'Nuevo Movimiento'}</h3>
  
  <!-- Type Toggle -->
  <div class="form-group">
    <label class="form-label">Tipo</label>
    <div class="form-toggle">
      <input type="radio" name="type" value="inversion" id="type-inversion" ${type === 'inversion' ? 'checked' : ''}>
      <label for="type-inversion" class="form-toggle__option">
        <span>💰</span> Inversión
      </label>
      <input type="radio" name="type" value="recuperacion" id="type-recuperacion" ${type === 'recuperacion' ? 'checked' : ''}>
      <label for="type-recuperacion" class="form-toggle__option">
        <span>💵</span> Recuperación
      </label>
    </div>
  </div>

  <!-- Amount -->
  <div class="form-group">
    <label class="form-label" for="amount">Monto ($)</label>
    <input type="text" inputmode="decimal" id="amount" name="amount" class="form-input form-input--amount" placeholder="0" value="${amount}" required autocomplete="off">
  </div>

  <!-- Description -->
  <div class="form-group">
    <label class="form-label" for="description">Descripción</label>
    <input type="text" id="description" name="description" class="form-input" placeholder="¿En qué se invirtió/recuperó?" value="${description}" autocomplete="off">
  </div>

  <!-- Date -->
  <div class="form-group">
    <label class="form-label" for="date">Fecha</label>
    <input type="date" id="date" name="date" class="form-input" value="${dateValue}" required>
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
  <button type="submit" class="btn btn--primary btn--full" id="submit-btn">
    ${isEditing ? 'Guardar Cambios ✨' : 'Guardar Movimiento ✨'}
  </button>
</form>
  `;
}

export function getFormData() {
  const form = document.getElementById('transaction-form');
  if (!form) return null;

  const editingIdInput = form.querySelector('#editing-id');
  const editingId = editingIdInput ? editingIdInput.value.trim() : null;

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
    id: editingId || null,
    type,
    amount,
    description: description.trim(),
    date,
    person
  };
}

export function populateForm(transaction) {
  const form = document.getElementById('transaction-form');
  if (!form || !transaction) return;

  const editingIdInput = form.querySelector('#editing-id');
  if (editingIdInput) editingIdInput.value = transaction.id || '';

  const titleEl = form.querySelector('#form-title');
  if (titleEl) titleEl.textContent = 'Editar Movimiento';

  const submitBtn = form.querySelector('#submit-btn');
  if (submitBtn) submitBtn.textContent = 'Guardar Cambios ✨';

  const typeRadio = form.querySelector(`input[name="type"][value="${transaction.type}"]`);
  if (typeRadio) typeRadio.checked = true;

  const amountInput = form.querySelector('#amount');
  if (amountInput) amountInput.value = transaction.amount || '';

  const descInput = form.querySelector('#description');
  if (descInput) descInput.value = transaction.description || '';

  const dateInput = form.querySelector('#date');
  if (dateInput) {
    dateInput.value = getDateInputValue(transaction.date);
  }

  const personRadio = form.querySelector(`input[name="person"][value="${transaction.person}"]`);
  if (personRadio) personRadio.checked = true;
}

export function resetForm(defaultPerson = null) {
  const form = document.getElementById('transaction-form');
  if (!form) return;

  const editingIdInput = form.querySelector('#editing-id');
  if (editingIdInput) editingIdInput.value = '';

  const titleEl = form.querySelector('#form-title');
  if (titleEl) titleEl.textContent = 'Nuevo Movimiento';

  const submitBtn = form.querySelector('#submit-btn');
  if (submitBtn) submitBtn.textContent = 'Guardar Movimiento ✨';

  const typeInversion = form.querySelector('#type-inversion');
  if (typeInversion) typeInversion.checked = true;

  const amount = form.querySelector('#amount');
  if (amount) amount.value = '';

  const description = form.querySelector('#description');
  if (description) description.value = '';

  const date = form.querySelector('#date');
  if (date) date.value = getDateInputValue();

  const targetPerson = defaultPerson || 'esmeralda';
  const personRadio = form.querySelector(`input[name="person"][value="${targetPerson}"]`);
  if (personRadio) personRadio.checked = true;
}
