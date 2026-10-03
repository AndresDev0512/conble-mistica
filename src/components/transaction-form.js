import {
  getDateInputValue,
  formatAmountInput,
  parseAmountInput,
  escapeHtml
} from '../utils/formatters.js';

export function renderTransactionForm(defaultPerson = null, editingTransaction = null) {
  const isEditing = !!editingTransaction;
  const person = isEditing ? editingTransaction.person : (defaultPerson || 'esmeralda');
  const isEsmeralda = person === 'esmeralda';
  const isAndres = person === 'andres';
  const type = isEditing ? editingTransaction.type : 'inversion';
  const amount = isEditing ? formatAmountInput(editingTransaction.amount) : '';
  const description = isEditing ? (editingTransaction.description || '') : '';
  const category = isEditing ? (editingTransaction.category || '') : '';
  const dateValue = isEditing && editingTransaction.date
    ? getDateInputValue(editingTransaction.date)
    : getDateInputValue();

  return `
<form id="transaction-form" class="transaction-form">
  <input type="hidden" id="editing-id" value="${isEditing ? escapeHtml(editingTransaction.id) : ''}">
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
    <input type="text" inputmode="numeric" id="amount" name="amount" class="form-input form-input--amount" placeholder="0" value="${escapeHtml(amount)}" required autocomplete="off">
  </div>

  <!-- Category -->
  <div class="form-group">
    <label class="form-label" for="category">Categoría</label>
    <input type="text" id="category" name="category" class="form-input" list="category-options"
           placeholder="Ropa, Comida, Transporte..." value="${escapeHtml(category)}" autocomplete="off">
    <datalist id="category-options"></datalist>
    <span class="form-hint">Elige una sugerencia o escribe la tuya</span>
  </div>

  <!-- Description -->
  <div class="form-group">
    <label class="form-label" for="description">Descripción</label>
    <input type="text" id="description" name="description" class="form-input" placeholder="¿En qué se invirtió/recuperó?" value="${escapeHtml(description)}" autocomplete="off">
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

/**
 * Llena el datalist con las categorias ya usadas. El formulario se renderiza
 * una sola vez al arrancar, asi que esto se refresca cada vez que cambian los
 * movimientos.
 *
 * @param {string[]} categories
 */
export function refreshCategorySuggestions(categories = []) {
  const datalist = document.getElementById('category-options');
  if (!datalist) return;

  datalist.innerHTML = categories
    .map(category => `<option value="${escapeHtml(category)}"></option>`)
    .join('');
}

export function getFormData() {
  const form = document.getElementById('transaction-form');
  if (!form) return null;

  const editingIdInput = form.querySelector('#editing-id');
  const editingId = editingIdInput ? editingIdInput.value.trim() : null;

  const type = form.querySelector('input[name="type"]:checked')?.value;
  const description = form.querySelector('#description').value;
  const category = form.querySelector('#category')?.value || '';
  const date = form.querySelector('#date').value;
  const person = form.querySelector('input[name="person"]:checked')?.value;

  // Tolera el punto de miles que se muestra mientras se escribe: '73.000' -> 73000
  const amount = parseAmountInput(form.querySelector('#amount').value);

  if (!amount || amount <= 0 || !person || !type || !date) {
    return null;
  }

  return {
    id: editingId || null,
    type,
    amount,
    description: description.trim(),
    category: category.trim(),
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
  if (amountInput) amountInput.value = formatAmountInput(transaction.amount);

  const categoryInput = form.querySelector('#category');
  if (categoryInput) categoryInput.value = transaction.category || '';

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

  const category = form.querySelector('#category');
  if (category) category.value = '';

  const description = form.querySelector('#description');
  if (description) description.value = '';

  const date = form.querySelector('#date');
  if (date) date.value = getDateInputValue();

  const targetPerson = defaultPerson || 'esmeralda';
  const personRadio = form.querySelector(`input[name="person"][value="${targetPerson}"]`);
  if (personRadio) personRadio.checked = true;
}