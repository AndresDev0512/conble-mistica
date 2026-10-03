import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, Timestamp } from 'firebase/firestore';
import { db, isConfigured } from './firebase.js';

const LOCAL_STORAGE_KEY = 'mistica_transactions';
let localListeners = [];
let firestoreDisabled = false;

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
 * person|type|amount|description|date
 */
const toContentKey = (t) => {
  if (!t) return '';
  const dateStr = toDateString(t.date);
  return `${t.person}|${t.type}|${Number(t.amount)}|${(t.description || '').trim().toLowerCase()}|${dateStr}`;
};

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

const shouldTryFirestore = () => {
  return isConfigured() && !firestoreDisabled;
};

/**
 * Bulk import helper for JSON files.
 * Writes directly to localStorage in a single operation.
 */
export const bulkImport = (items) => {
  console.group(`[Mistica][bulkImport] Importando ${items.length} registro(s)...`);

  if (!Array.isArray(items) || items.length === 0) {
    console.warn(`⚠️ El arreglo a importar está vacío o no es válido.`);
    console.groupEnd();
    return { imported: 0, skipped: 0 };
  }

  const existing = getLocalTransactions();
  const existingKeys = new Set(existing.map(toContentKey));

  let imported = 0;
  let skipped = 0;
  const toAdd = [];

  items.forEach((item, idx) => {
    const key = toContentKey(item);

    if (existingKeys.has(key)) {
      skipped++;
    } else {
      const dateStr = toDateString(item.date);
      const newRecord = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + imported,
        person: item.person || 'esmeralda',
        type: item.type || 'inversion',
        amount: Number(item.amount) || 0,
        description: (item.description || '').trim(),
        date: dateStr,
        createdAt: new Date().toISOString(),
        syncedToFirestore: false
      };
      toAdd.push(newRecord);
      existingKeys.add(key);
      imported++;
    }
  });

  console.log(`📊 Resultado -> Nuevos: ${toAdd.length} | Omitidos: ${skipped}`);

  if (toAdd.length > 0) {
    saveLocalTransactions([...existing, ...toAdd]);
  }

  console.groupEnd();
  return { imported, skipped };
};

export const addTransaction = async (data) => {
  const { person, type, amount, description, date } = data;
  const numericAmount = Number(amount);

  if (isNaN(numericAmount) || numericAmount <= 0) {
    throw new Error('Monto inválido');
  }

  const dateISO = toDateString(date);

  const localRecord = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    person,
    type,
    amount: numericAmount,
    description: description ? description.trim() : '',
    date: dateISO,
    createdAt: new Date().toISOString(),
    syncedToFirestore: false
  };

  // 1. Write to localStorage immediately
  const currentLocal = getLocalTransactions();
  
  // Deduplicate against local records before pushing
  const recordKey = toContentKey(localRecord);
  const existsLocally = currentLocal.some(lt => toContentKey(lt) === recordKey);
  if (!existsLocally) {
    currentLocal.push(localRecord);
    saveLocalTransactions(currentLocal);
  }

  // 2. Async attempt to write to Firestore (if available)
  if (shouldTryFirestore()) {
    try {
      const firestoreData = {
        person,
        type,
        amount: numericAmount,
        description: description ? description.trim() : '',
        date: Timestamp.fromDate(parseDate(date)),
        createdAt: Timestamp.now()
      };
      const ref = await addDoc(collection(db, 'transactions'), firestoreData);
      
      // Update local record silently with Firestore ID
      const updated = getLocalTransactions();
      const idx = updated.findIndex(t => t.id === localRecord.id);
      if (idx !== -1) {
        updated[idx].id = ref.id;
        updated[idx].syncedToFirestore = true;
        saveLocalTransactionsSilently(updated);
      }
      return { id: ref.id };
    } catch (error) {
      if (error.code === 'permission-denied') {
        firestoreDisabled = true;
        console.warn('[Mistica] Reglas de Firebase denegadas. Continuando 100% en modo local.');
      }
    }
  }

  return { id: localRecord.id };
};

export const updateTransaction = async (id, data) => {
  const { person, type, amount, description, date } = data;
  const numericAmount = Number(amount);

  if (isNaN(numericAmount) || numericAmount <= 0) {
    throw new Error('Monto inválido');
  }

  const dateISO = toDateString(date);

  // Update in localStorage immediately
  let localTransactions = getLocalTransactions();
  const idx = localTransactions.findIndex(t => t.id === id);
  if (idx !== -1) {
    localTransactions[idx] = {
      ...localTransactions[idx],
      person,
      type,
      amount: numericAmount,
      description: description ? description.trim() : '',
      date: dateISO
    };
    saveLocalTransactions(localTransactions);
  }

  // Update in Firestore asynchronously if available
  if (shouldTryFirestore()) {
    try {
      const firestoreData = {
        person,
        type,
        amount: numericAmount,
        description: description ? description.trim() : '',
        date: Timestamp.fromDate(parseDate(date))
      };
      await updateDoc(doc(db, 'transactions', id), firestoreData);
    } catch (error) {
      if (error.code === 'permission-denied') {
        firestoreDisabled = true;
      }
    }
  }
};

export const deleteTransaction = async (id) => {
  // Delete from localStorage immediately
  let transactions = getLocalTransactions();
  transactions = transactions.filter(t => t.id !== id);
  saveLocalTransactions(transactions);

  // Try deleting from Firestore if available
  if (shouldTryFirestore()) {
    try {
      await deleteDoc(doc(db, 'transactions', id));
    } catch (error) {
      if (error.code === 'permission-denied') {
        firestoreDisabled = true;
      }
    }
  }
};

export const subscribeToTransactions = (callback) => {
  if (!localListeners.includes(callback)) {
    localListeners.push(callback);
  }

  // Emit initial local state immediately
  const initialLocal = getLocalTransactions();
  initialLocal.sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime());
  callback(initialLocal);

  if (shouldTryFirestore()) {
    try {
      const q = query(collection(db, 'transactions'), orderBy('date', 'desc'));
      const unsubscribeFirestore = onSnapshot(q, (snapshot) => {
        const firestoreDocs = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data(),
          syncedToFirestore: true
        }));

        const firestoreContentKeys = new Set(firestoreDocs.map(toContentKey));

        const currentLocal = getLocalTransactions();
        // Keep unsynced local items ONLY if their content fingerprint is NOT already in Firestore
        const unsyncedLocal = currentLocal.filter(lt => 
          lt.syncedToFirestore === false && 
          !firestoreDocs.some(fd => fd.id === lt.id) &&
          !firestoreContentKeys.has(toContentKey(lt))
        );

        const merged = [...firestoreDocs, ...unsyncedLocal];
        merged.sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime());

        saveLocalTransactionsSilently(merged);
        callback(merged);
      }, (error) => {
        if (error.code === 'permission-denied') {
          firestoreDisabled = true;
          console.warn('[Mistica] Firestore denegado. Cambiando a modo local (localStorage).');
        }
        callback(getLocalTransactions());
      });

      return () => {
        unsubscribeFirestore();
        localListeners = localListeners.filter(cb => cb !== callback);
      };
    } catch (error) {
      firestoreDisabled = true;
      return () => {
        localListeners = localListeners.filter(cb => cb !== callback);
      };
    }
  } else {
    return () => {
      localListeners = localListeners.filter(cb => cb !== callback);
    };
  }
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
