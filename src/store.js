import { collection, setDoc, deleteDoc, doc, onSnapshot, query, orderBy, Timestamp } from 'firebase/firestore';
import { db, isConfigured } from './firebase.js';

const LOCAL_STORAGE_KEY = 'mistica_transactions';
const PENDING_DELETES_KEY = 'mistica_pending_deletes';

/**
 * Los errores de reglas no se recuperan solos, pero tampoco tiene sentido
 * renunciar a la nube hasta recargar la pagina. Este es el tiempo de espera
 * antes de volver a intentarlo.
 */
const RULES_BACKOFF_MS = 60000;

let localListeners = [];
let syncStatusListeners = [];
let firestoreDisabledUntil = 0;
let lastSyncError = null;
let isSyncing = false;

/**
 * Safely parses any date representation (ISO string, Timestamp, YYYY-MM-DD, number)
 * into a valid JavaScript Date object.
 */
export const parseDate = (date) => {
  if (!date) return new Date();
  if (typeof date.toDate === 'function') {
    try { return date.toDate(); } catch (e) { /* fallback */ }
  }
  if (typeof date === 'object' && date.seconds !== undefined) {
    return new Date(date.seconds * 1000);
  }
  const parsed = new Date(date);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
};

/**
 * Formats any date into a YYYY-MM-DD string.
 */
export const toDateString = (raw) => {
  const d = parseDate(raw);
  return d.toISOString().slice(0, 10);
};

/**
 * Content fingerprint for duplicate prevention:
 * person|type|amount|description|category|date
 */
const toContentKey = (t) => {
  if (!t) return '';
  const dateStr = toDateString(t.date);
  const description = (t.description || '').trim().toLowerCase();
  const category = (t.category || '').trim().toLowerCase();
  return `${t.person}|${t.type}|${Number(t.amount)}|${description}|${category}|${dateStr}`;
};

/**
 * Id estable generado en el cliente. Se usa como id del documento en Firestore
 * (setDoc), de modo que reintentar una subida nunca crea duplicados y el id no
 * cambia entre la copia local y la de la nube.
 */
const generateStableId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const getLocalTransactions = () => {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    const transactions = data ? JSON.parse(data) : [];
    return Array.isArray(transactions) ? transactions : [];
  } catch (err) {
    console.error('[Mistica][localStorage] Error al leer localStorage:', err);
    return [];
  }
};

const saveLocalTransactionsSilently = (transactions) => {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(transactions));
  } catch (err) {
    console.error('[Mistica][localStorage] Error al guardar en localStorage:', err);
  }
};

const saveLocalTransactions = (transactions) => {
  saveLocalTransactionsSilently(transactions);
  notifyLocalListeners();
};

const notifyLocalListeners = () => {
  const transactions = getLocalTransactions();
  transactions.sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime());

  localListeners.forEach(cb => {
    try {
      cb(transactions);
    } catch (err) {
      console.error('[Mistica][store] Error en callback de listener:', err);
    }
  });
};

const getPendingDeletes = () => {
  try {
    const data = JSON.parse(localStorage.getItem(PENDING_DELETES_KEY) || '[]');
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('[Mistica][localStorage] Error al leer borrados pendientes:', err);
    return [];
  }
};

const setPendingDeletes = (ids) => {
  try {
    localStorage.setItem(PENDING_DELETES_KEY, JSON.stringify(ids));
  } catch (err) {
    console.error('[Mistica][localStorage] Error al guardar borrados pendientes:', err);
  }
};

const addPendingDelete = (id) => {
  const ids = getPendingDeletes();
  if (!ids.includes(id)) setPendingDeletes([...ids, id]);
};

const shouldTryFirestore = () => {
  return isConfigured() && Date.now() >= firestoreDisabledUntil;
};

/**
 * True cuando un error de reglas dejo la nube inutilizable y todavia no
 * expiro el tiempo de espera.
 */
const isFirestoreBlocked = () => {
  return isConfigured() && Date.now() < firestoreDisabledUntil;
};

/* ---------------------------------------------------------------------------
 * Clasificacion de errores
 *
 * Antes cualquier fallo se tragaba en silencio y el movimiento se perdia para
 * siempre. Ahora se distingue entre "las reglas no me dejan" (problema de
 * configuracion) y "no hay conexion" (problema temporal, reintentable).
 * ------------------------------------------------------------------------- */

const RULES_ERRORS = ['permission-denied', 'unauthenticated', 'app-check-failed'];
const TRANSIENT_ERRORS = ['unavailable', 'deadline-exceeded', 'internal-error', 'network-request-failed'];

const classifyError = (error) => {
  const code = error && error.code ? error.code : '';
  if (RULES_ERRORS.includes(code)) return 'rules';
  if (TRANSIENT_ERRORS.includes(code)) return 'transient';
  return 'unknown';
};

const handleFirestoreError = (error, context) => {
  const kind = classifyError(error);
  const code = error && error.code ? error.code : 'sin-codigo';

  if (kind === 'rules') {
    firestoreDisabledUntil = Date.now() + RULES_BACKOFF_MS;
    lastSyncError = `Firebase bloqueo la operacion (${code}). Reintento en 1 minuto.`;
    console.error(`[Mistica][sync] ${context}: las reglas de Firebase denegaron la operacion (${code}).`);
  } else if (kind === 'transient') {
    lastSyncError = 'Sin conexion con Firebase. Los cambios quedan pendientes.';
    console.warn(`[Mistica][sync] ${context}: fallo transitorio (${code}). Se reintentara.`);
  } else {
    lastSyncError = `Error inesperado de Firebase (${code}).`;
    console.error(`[Mistica][sync] ${context}: error inesperado.`, error);
  }

  notifySyncStatus();
  return kind;
};

/* ---------------------------------------------------------------------------
 * Estado de sincronizacion
 * ------------------------------------------------------------------------- */

const countPending = () => getLocalTransactions().filter(t => !t.syncedToFirestore).length;

/**
 * Movimientos que siguen sin llegar a la nube. Pensado para diagnosticar desde
 * la consola del navegador: mistica.pendientes()
 */
export const getPendingRecords = () => getLocalTransactions().filter(t => !t.syncedToFirestore);

/**
 * Categorias ya usadas, sin repetir y en orden alfabetico. Alimenta las
 * sugerencias del formulario y las pastillas de filtro.
 *
 * @param {Array} [transactions] Si se omite, se leen del almacenamiento local.
 * @returns {string[]}
 */
export const getCategories = (transactions) => {
  const source = Array.isArray(transactions) ? transactions : getLocalTransactions();
  const unique = new Set();

  source.forEach(t => {
    const category = (t && t.category ? t.category : '').trim();
    if (category) unique.add(category);
  });

  return [...unique].sort((a, b) => a.localeCompare(b, 'es'));
};

export const getSyncStatus = () => {
  const pending = countPending();

  if (lastSyncError) return { state: 'error', pending, message: lastSyncError };
  if (!isConfigured()) return { state: 'local', pending, message: 'Firebase no configurado' };
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { state: 'offline', pending, message: 'Sin conexion a internet' };
  }
  if (Date.now() < firestoreDisabledUntil) {
    return { state: 'blocked', pending, message: 'Firebase bloqueado por reglas' };
  }
  if (isSyncing) return { state: 'syncing', pending, message: 'Sincronizando' };
  if (pending > 0) return { state: 'pending', pending, message: `${pending} pendiente(s) de subir` };

  return { state: 'synced', pending: 0, message: 'Sincronizado con la nube' };
};

export const subscribeToSyncStatus = (callback) => {
  if (!syncStatusListeners.includes(callback)) {
    syncStatusListeners.push(callback);
  }
  callback(getSyncStatus());

  return () => {
    syncStatusListeners = syncStatusListeners.filter(cb => cb !== callback);
  };
};

const notifySyncStatus = () => {
  const status = getSyncStatus();
  syncStatusListeners.forEach(cb => {
    try {
      cb(status);
    } catch (err) {
      console.error('[Mistica][store] Error en callback de sync status:', err);
    }
  });
};

/* ---------------------------------------------------------------------------
 * Acceso a Firestore
 * ------------------------------------------------------------------------- */

const toFirestoreDoc = (record) => ({
  person: record.person,
  type: record.type,
  amount: Number(record.amount),
  description: (record.description || '').trim(),
  category: (record.category || '').trim(),
  date: Timestamp.fromDate(parseDate(record.date)),
  createdAt: record.createdAt
    ? Timestamp.fromDate(parseDate(record.createdAt))
    : Timestamp.now(),
});

const markSynced = (id) => {
  const records = getLocalTransactions();
  const idx = records.findIndex(t => t.id === id);
  if (idx === -1 || records[idx].syncedToFirestore === true) return;

  records[idx].syncedToFirestore = true;
  saveLocalTransactionsSilently(records);
  notifySyncStatus();
};

/**
 * Tiempo maximo que la interfaz espera una confirmacion de Firestore.
 *
 * Sin esto, guardar sin conexion deja el modal abierto indefinidamente: el SDK
 * no rechaza la escritura, la encola y la promesa nunca resuelve. La escritura
 * sigue su curso en segundo plano; solo dejamos de esperarla.
 */
const UPLOAD_TIMEOUT_MS = 2000;

const pushRecord = async (record, context = 'subiendo un movimiento') => {
  if (!shouldTryFirestore()) {
    console.log(`[Mistica][sync] ${context}: se omite "${record.id}" porque Firebase no esta disponible ahora.`);
    return 'unavailable';
  }

  let synced = false;

  const upload = setDoc(doc(db, 'transactions', record.id), toFirestoreDoc(record)).then(
    () => {
      synced = true;
      markSynced(record.id);
      if (lastSyncError) lastSyncError = null;
      console.log(`[Mistica][sync] ${context}: "${record.id}" (${record.type} ${record.amount}) subido a la nube.`);
    },
    (error) => { handleFirestoreError(error, context); }
  );

  const outcome = await Promise.race([
    upload.then(() => 'done'),
    new Promise((resolve) => setTimeout(() => resolve('timeout'), UPLOAD_TIMEOUT_MS)),
  ]);

  if (outcome === 'timeout') {
    console.warn(`[Mistica][sync] ${context}: "${record.id}" tardo mas de ${UPLOAD_TIMEOUT_MS / 1000}s. Queda pendiente y se reintentara.`);
    return 'timeout';
  }

  return synced ? 'synced' : 'error';
};

/**
 * Sube todo lo que quedo pendiente en local. Es lo que rescata los movimientos
 * creados mientras la nube estaba inaccesible, y corre en cada arranque.
 *
 * Al usar ids estables con setDoc, ejecutarla dos veces no genera duplicados.
 */
export const syncPendingToFirestore = async () => {
  if (isSyncing) return { uploaded: 0, failed: 0, skipped: true };
  if (!shouldTryFirestore()) {
    console.log('[Mistica][sync] Backfill omitido: Firebase no esta disponible en este momento.');
    return { uploaded: 0, failed: 0 };
  }

  isSyncing = true;
  notifySyncStatus();

  try {
    let deleted = 0;

    for (const id of getPendingDeletes()) {
      try {
        await deleteDoc(doc(db, 'transactions', id));
        setPendingDeletes(getPendingDeletes().filter(d => d !== id));
        deleted++;
        console.log(`[Mistica][sync] Borrado pendiente aplicado en la nube: "${id}".`);
      } catch (error) {
        if (classifyError(error) === 'rules') {
          handleFirestoreError(error, 'aplicando borrados pendientes');
          break;
        }
      }
    }

    const pending = getPendingRecords();
    let uploaded = 0;
    let failed = 0;
    let timedOut = false;

    for (const record of pending) {
      const result = await pushRecord(record, 'subiendo movimientos pendientes');

      if (result === 'synced') {
        uploaded++;
        continue;
      }

      failed++;

      // Sin red o con las reglas cerradas, insistir registro por registro solo
      // haria esperar 2s por cada uno. Se corta y se reintenta en el proximo paso.
      if (result === 'timeout' || result === 'unavailable') {
        timedOut = true;
        break;
      }

      // Un error de reglas deja la nube inutilizable: no seguir gastando intentos.
      if (isFirestoreBlocked()) break;
    }

    // pushRecord ya persiste el_flag syncedToFirestore_ al completar cada
    // escritura, asi que hay que releer en vez de guardar el arreglo viejo.
    const remaining = getPendingRecords().length;
    console.log(
      `[Mistica][sync] Backfill terminado -> Subidos: ${uploaded} | Fallidos: ${failed} | ` +
      `Borrados: ${deleted} | Pendientes restantes: ${remaining}` +
      (timedOut ? ' (red no disponible, se reintentara)' : '')
    );

    return { uploaded, failed, deleted, remaining, timedOut };
  } finally {
    isSyncing = false;
    notifySyncStatus();
  }
};

/* ---------------------------------------------------------------------------
 * Operaciones sobre movimientos
 * ------------------------------------------------------------------------- */

/**
 * Bulk import helper for JSON files.
 * Writes directly to localStorage, marking records as pending so that
 * syncPendingToFirestore() uploads them afterwards.
 */
export const bulkImport = (items) => {
  console.group(`[Mistica][bulkImport] Importando ${items.length} registro(s)...`);

  if (!Array.isArray(items) || items.length === 0) {
    console.warn(`El arreglo a importar esta vacio o no es valido.`);
    console.groupEnd();
    return { imported: 0, skipped: 0 };
  }

  const existing = getLocalTransactions();
  const existingKeys = new Set(existing.map(toContentKey));

  let imported = 0;
  let skipped = 0;
  const toAdd = [];

  items.forEach((item) => {
    const key = toContentKey(item);

    if (existingKeys.has(key)) {
      skipped++;
    } else {
      const newRecord = {
        id: generateStableId(),
        person: item.person || 'esmeralda',
        type: item.type || 'inversion',
        amount: Number(item.amount) || 0,
        description: (item.description || '').trim(),
        category: (item.category || '').trim(),
        date: toDateString(item.date),
        createdAt: new Date().toISOString(),
        syncedToFirestore: false
      };
      toAdd.push(newRecord);
      existingKeys.add(key);
      imported++;
    }
  });

  console.log(`Resultado -> Nuevos: ${toAdd.length} | Omitidos: ${skipped}`);

  if (toAdd.length > 0) {
    saveLocalTransactions([...existing, ...toAdd]);
  }

  console.groupEnd();
  return { imported, skipped };
};

export const addTransaction = async (data) => {
  const { person, type, amount, description, date, category } = data;
  const numericAmount = Number(amount);

  if (isNaN(numericAmount) || numericAmount <= 0) {
    throw new Error('Monto inválido');
  }

  const localRecord = {
    id: generateStableId(),
    person,
    type,
    amount: numericAmount,
    description: description ? description.trim() : '',
    category: category ? category.trim() : '',
    date: toDateString(date),
    createdAt: new Date().toISOString(),
    syncedToFirestore: false
  };

  // 1. Guardar en local de inmediato: la app nunca depende de la red
  const currentLocal = getLocalTransactions();
  const duplicate = currentLocal.find(lt => toContentKey(lt) === toContentKey(localRecord));

  // Si el mismo movimiento ya existe, no se crea otro ni se sube a la nube:
  // hacerlo generaria un duplicado con id distinto.
  if (duplicate) {
    const result = duplicate.syncedToFirestore
      ? 'synced'
      : await pushRecord(duplicate, 'subiendo un movimiento existente');
    return { id: duplicate.id, synced: result === 'synced', duplicate: true };
  }

  currentLocal.push(localRecord);
  saveLocalTransactions(currentLocal);

  // 2. Intentar subir. El id no cambia: es el mismo en local y en la nube.
  const result = await pushRecord(localRecord);

  return { id: localRecord.id, synced: result === 'synced' };
};

export const updateTransaction = async (id, data) => {
  const numericAmount = Number(data.amount);

  if (isNaN(numericAmount) || numericAmount <= 0) {
    throw new Error('Monto inválido');
  }

  const records = getLocalTransactions();
  const idx = records.findIndex(t => t.id === id);
  if (idx === -1) {
    throw new Error('Movimiento no encontrado');
  }

  records[idx] = {
    ...records[idx],
    person: data.person,
    type: data.type,
    amount: numericAmount,
    description: data.description ? data.description.trim() : '',
    category: data.category ? data.category.trim() : '',
    date: toDateString(data.date),
    syncedToFirestore: false
  };
  saveLocalTransactions(records);

  // setDoc actua como upsert: si el movimiento nunca llego a la nube, se crea.
  const result = await pushRecord(records[idx], 'actualizando un movimiento');

  return { id, synced: result === 'synced' };
};

export const deleteTransaction = async (id) => {
  const records = getLocalTransactions();
  const record = records.find(t => t.id === id);

  saveLocalTransactions(records.filter(t => t.id !== id));

  // Si nunca llego a la nube, no hay nada que borrar alla.
  if (!record || !record.syncedToFirestore) return { deleted: true };

  if (!shouldTryFirestore()) {
    addPendingDelete(id);
    notifySyncStatus();
    return { deleted: true, pendingDelete: true };
  }

  try {
    await deleteDoc(doc(db, 'transactions', id));
    return { deleted: true };
  } catch (error) {
    if (classifyError(error) === 'rules') {
      handleFirestoreError(error, 'eliminando un movimiento');
      addPendingDelete(id);
      return { deleted: true, pendingDelete: true };
    }

    // not-found: el documento ya no estaba en la nube. Nada que hacer.
    if (error.code === 'not-found') return { deleted: true };

    handleFirestoreError(error, 'eliminando un movimiento');
    return { deleted: true, pendingDelete: true };
  }
};

export const subscribeToTransactions = (callback) => {
  if (!localListeners.includes(callback)) {
    localListeners.push(callback);
  }

  const cleanup = () => {
    localListeners = localListeners.filter(cb => cb !== callback);
  };

  // Emitir el estado local de inmediato, sin esperar a la red
  const initialLocal = getLocalTransactions();
  initialLocal.sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime());
  callback(initialLocal);

  if (!shouldTryFirestore()) {
    cleanup();
    return cleanup;
  }

  let unsubscribeFirestore = () => {};

  try {
    const q = query(collection(db, 'transactions'), orderBy('date', 'desc'));

    unsubscribeFirestore = onSnapshot(q, (snapshot) => {
      const firestoreDocs = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
        syncedToFirestore: true
      }));

      const firestoreIds = new Set(firestoreDocs.map(d => d.id));
      const firestoreContentKeys = new Set(firestoreDocs.map(toContentKey));
      const currentLocal = getLocalTransactions();

      // Un snapshot servido desde la cache no sirve para decidir borrados.
      const serverConfirmed = !snapshot.metadata?.fromCache;
      const firestoreEmpty = firestoreDocs.length === 0;
      const droppedIds = [];

      const localOnly = currentLocal.filter(lt => {
        if (firestoreIds.has(lt.id)) return false;
        if (firestoreContentKeys.has(toContentKey(lt))) return false;

        if (lt.syncedToFirestore === false) return true;

        // Estaba sincronizado pero ya no aparece en la nube. Si el servidor
        // confirms que hay documentos, se asume borrado desde otro dispositivo.
        // Si la nube viniera vacia, descartar seria perder datos, asi que se
        // conserva como pendiente para volver a subirlo.
        if (serverConfirmed && !firestoreEmpty) {
          droppedIds.push(lt.id);
          return false;
        }

        lt.syncedToFirestore = false;
        return true;
      });

      if (droppedIds.length > 0) {
        console.warn(`[Mistica][sync] ${droppedIds.length} movimiento(s) ya no estan en la nube y se quitaron del dispositivo:`, droppedIds);
      }

      console.log(
        `[Mistica][sync] Sincronizacion en tiempo real activa -> ` +
        `${firestoreDocs.length} doc(s) en la nube, ${localOnly.length} solo en este dispositivo ` +
        `(respuesta ${serverConfirmed ? 'del servidor' : 'de la cache'}).`
      );

      const merged = [...firestoreDocs, ...localOnly];
      merged.sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime());

      saveLocalTransactionsSilently(merged);
      callback(merged);
      notifySyncStatus();

      // Rescatar lo pendiente solo cuando la respuesta viene del servidor.
      if (serverConfirmed && localOnly.length > 0) {
        syncPendingToFirestore();
      }
    }, (error) => {
      handleFirestoreError(error, 'suscripcion en tiempo real');
      callback(getLocalTransactions());
    });
  } catch (error) {
    handleFirestoreError(error, 'suscripcion en tiempo real');
    return cleanup;
  }

  return () => {
    unsubscribeFirestore();
    cleanup();
  };
};

export const getStats = (transactions = []) => {
  const initStats = () => ({ totalInversion: 0, totalRecuperacion: 0, balance: 0, transactionCount: 0 });

  const stats = {
    esmeralda: initStats(),
    andres: initStats(),
    combined: initStats()
  };

  if (!Array.isArray(transactions)) return stats;

  transactions.forEach(t => {
    if (!t) return;
    const person = t.person;
    if (!stats[person]) return;

    const amount = Number(t.amount);
    if (isNaN(amount) || amount <= 0) return;

    stats[person].transactionCount++;
    stats.combined.transactionCount++;

    if (t.type === 'inversion') {
      stats[person].totalInversion += amount;
      stats.combined.totalInversion += amount;

      stats[person].balance -= amount;
      stats.combined.balance -= amount;
    } else if (t.type === 'recuperacion') {
      stats[person].totalRecuperacion += amount;
      stats.combined.totalRecuperacion += amount;

      stats[person].balance += amount;
      stats.combined.balance += amount;
    }
  });

  const totalInv = stats.combined.totalInversion;
  stats.combined.esmeraldaPercent = totalInv > 0 ? (stats.esmeralda.totalInversion / totalInv) * 100 : 0;
  stats.combined.andresPercent = totalInv > 0 ? (stats.andres.totalInversion / totalInv) * 100 : 0;

  return stats;
};

export const getTransactionsByPerson = (transactions, person) => {
  if (!Array.isArray(transactions)) return [];
  return transactions.filter(t => t && t.person === person);
};
