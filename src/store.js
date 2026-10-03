import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, Timestamp } from 'firebase/firestore';
import { db, isConfigured } from './firebase.js';

const LOCAL_STORAGE_KEY = 'mistica_transactions';
let localListeners = [];

const getLocalTransactions = () => {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    const transactions = data ? JSON.parse(data) : [];
    return transactions;
  } catch (err) {
    console.error('[Mistica][localStorage] Error al leer de localStorage:', err);
    return [];
  }
};

const saveLocalTransactions = (transactions) => {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(transactions));
    notifyLocalListeners();
  } catch (err) {
    console.error('[Mistica][localStorage] Error al escribir en localStorage:', err);
  }
};

const notifyLocalListeners = () => {
  const transactions = getLocalTransactions();
  transactions.sort((a, b) => {
    const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
    const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
    return dateB.getTime() - dateA.getTime();
  });
  localListeners.forEach(cb => {
    try {
      cb(transactions);
    } catch (err) {
      console.error('[Mistica][store] Error en callback de listener:', err);
    }
  });
};

const newTraceId = () => Math.random().toString(36).slice(2, 8);

/**
 * Syncs unsynced local transactions to Firestore if available.
 */
const syncUnsyncedLocalTransactions = async () => {
  if (!isConfigured()) return;
  const localTransactions = getLocalTransactions();
  const unsynced = localTransactions.filter(t => t.syncedToFirestore === false);

  if (unsynced.length === 0) return;

  console.log(`[Mistica][sync] Intentando sincronizar ${unsynced.length} registro(s) pendiente(s) a Firestore...`);
  
  for (const item of unsynced) {
    try {
      const firestoreData = {
        person: item.person,
        type: item.type,
        amount: Number(item.amount),
        description: item.description || '',
        date: Timestamp.fromDate(new Date(item.date)),
        createdAt: Timestamp.now()
      };
      const ref = await addDoc(collection(db, 'transactions'), firestoreData);
      console.log(`[Mistica][sync] Registro ${item.id} sincronizado exitosamente con ID en Firestore: ${ref.id}`);
      
      // Update local item
      item.id = ref.id;
      item.syncedToFirestore = true;
    } catch (err) {
      console.warn(`[Mistica][sync] Error al sincronizar registro ${item.id} a Firestore:`, err.message);
      break; // Pause sync loop if network/permission fails
    }
  }

  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localTransactions));
};

export const addTransaction = async (data) => {
  const { person, type, amount, description, date } = data;
  const trace = newTraceId();
  const useFirestore = isConfigured();

  const numericAmount = Number(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    throw new Error('Monto inválido');
  }

  console.log(`[${trace}][addTransaction] Guardando movimiento:`, data);

  // Create local record object
  const localRecord = {
    id: Date.now().toString() + Math.random().toString(36).substring(7),
    person,
    type,
    amount: numericAmount,
    description: description ? description.trim() : '',
    date: new Date(date).toISOString(),
    createdAt: new Date().toISOString(),
    syncedToFirestore: false
  };

  if (useFirestore) {
    const firestoreData = {
      person,
      type,
      amount: numericAmount,
      description: description ? description.trim() : '',
      date: Timestamp.fromDate(new Date(date)),
      createdAt: Timestamp.now()
    };

    try {
      const ref = await addDoc(collection(db, 'transactions'), firestoreData);
      console.log(`[${trace}][addTransaction] Guardado exitosamente en Firestore con id:`, ref.id);
      
      localRecord.id = ref.id;
      localRecord.syncedToFirestore = true;
      
      // Always store locally as cache/backup
      const currentLocal = getLocalTransactions();
      const existingIdx = currentLocal.findIndex(t => t.id === ref.id);
      if (existingIdx >= 0) {
        currentLocal[existingIdx] = localRecord;
      } else {
        currentLocal.push(localRecord);
      }
      saveLocalTransactions(currentLocal);

      return { id: ref.id };
    } catch (error) {
      console.warn(
        `[${trace}][addTransaction] Error en Firestore (${error.code || error.message}). ` +
        `Guardando localmente en localStorage como respaldo seguro.`
      );
      // Fallback to local storage so data is NEVER lost!
      const currentLocal = getLocalTransactions();
      currentLocal.push(localRecord);
      saveLocalTransactions(currentLocal);
      return { id: localRecord.id, offlineFallback: true };
    }
  } else {
    const currentLocal = getLocalTransactions();
    currentLocal.push(localRecord);
    saveLocalTransactions(currentLocal);
    console.log(`[${trace}][addTransaction] Guardado en localStorage con id:`, localRecord.id);
    return { id: localRecord.id };
  }
};

export const updateTransaction = async (id, data) => {
  const { person, type, amount, description, date } = data;
  const trace = newTraceId();
  const numericAmount = Number(amount);

  if (isNaN(numericAmount) || numericAmount <= 0) {
    throw new Error('Monto inválido');
  }

  console.log(`[${trace}][updateTransaction] Actualizando registro ${id}:`, data);

  // Update in localStorage first
  let localTransactions = getLocalTransactions();
  const idx = localTransactions.findIndex(t => t.id === id);
  if (idx !== -1) {
    localTransactions[idx] = {
      ...localTransactions[idx],
      person,
      type,
      amount: numericAmount,
      description: description ? description.trim() : '',
      date: new Date(date).toISOString(),
      syncedToFirestore: isConfigured() ? localTransactions[idx].syncedToFirestore : false
    };
    saveLocalTransactions(localTransactions);
  }

  // Update in Firestore if configured
  if (isConfigured()) {
    try {
      const firestoreData = {
        person,
        type,
        amount: numericAmount,
        description: description ? description.trim() : '',
        date: Timestamp.fromDate(new Date(date))
      };
      await updateDoc(doc(db, 'transactions', id), firestoreData);
      console.log(`[${trace}][updateTransaction] Registro actualizado en Firestore:`, id);
    } catch (error) {
      console.warn(`[${trace}][updateTransaction] Error al actualizar en Firestore (${error.message}). Se conserva cambio en localStorage.`);
    }
  }
};

export const deleteTransaction = async (id) => {
  const trace = newTraceId();
  console.log(`[${trace}][deleteTransaction] Eliminando id:`, id);

  // Delete from localStorage
  let transactions = getLocalTransactions();
  transactions = transactions.filter(t => t.id !== id);
  saveLocalTransactions(transactions);

  // Try deleting from Firestore if configured
  if (isConfigured()) {
    try {
      await deleteDoc(doc(db, 'transactions', id));
      console.log(`[${trace}][deleteTransaction] Eliminado de Firestore:`, id);
    } catch (error) {
      console.warn(`[${trace}][deleteTransaction] Error al eliminar de Firestore (${error.message}). Eliminado localmente.`);
    }
  }
};

export const subscribeToTransactions = (callback) => {
  // Always register callback for local updates
  if (!localListeners.includes(callback)) {
    localListeners.push(callback);
  }

  // Deliver initial state from localStorage immediately
  const initialLocal = getLocalTransactions();
  initialLocal.sort((a, b) => {
    const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
    const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
    return dateB.getTime() - dateA.getTime();
  });
  callback(initialLocal);

  if (isConfigured()) {
    console.log('[Mistica][subscribe] Conectando listener en tiempo real con Firestore');
    try {
      const q = query(collection(db, 'transactions'), orderBy('date', 'desc'));
      const unsubscribeFirestore = onSnapshot(q, (snapshot) => {
        const firestoreDocs = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data(),
          syncedToFirestore: true
        }));

        // Merge Firestore docs with any unsynced local docs
        const currentLocal = getLocalTransactions();
        const unsyncedLocal = currentLocal.filter(lt => 
          lt.syncedToFirestore === false && 
          !firestoreDocs.some(fd => fd.id === lt.id)
        );

        const merged = [...firestoreDocs, ...unsyncedLocal];
        merged.sort((a, b) => {
          const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
          const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
          return dateB.getTime() - dateA.getTime();
        });

        // Update local storage cache
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
        } catch (e) {
          console.error('[Mistica][subscribe] Error guardando caché local:', e);
        }

        callback(merged);

        // Attempt background sync of local unsynced items
        syncUnsyncedLocalTransactions().catch(err => {
          console.warn('[Mistica][subscribe] Background sync notification:', err);
        });
      }, (error) => {
        console.warn(
          '[Mistica][subscribe] Firestore no disponible o bloqueado por reglas de seguridad:',
          error.code, error.message,
          '-- Utilizando almacenamiento local persistente.'
        );
        // Fallback: Notify callback using local data
        const localData = getLocalTransactions();
        localData.sort((a, b) => {
          const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
          const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
          return dateB.getTime() - dateA.getTime();
        });
        callback(localData);
      });

      return () => {
        unsubscribeFirestore();
        localListeners = localListeners.filter(cb => cb !== callback);
      };
    } catch (error) {
      console.warn('[Mistica][subscribe] Fallo inicial de suscripción a Firestore:', error);
      return () => {
        localListeners = localListeners.filter(cb => cb !== callback);
      };
    }
  } else {
    console.warn('[Mistica][subscribe] Firebase no configurado. Operando 100% en modo local (localStorage).');
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

  transactions.forEach(t => {
    const person = t.person;
    if (!stats[person]) return;

    const amount = Number(t.amount);
    if (isNaN(amount)) return;
    
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
  return transactions.filter(t => t.person === person);
};
