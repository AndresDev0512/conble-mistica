import { collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, Timestamp } from 'firebase/firestore';
import { db, isConfigured } from './firebase.js';

const LOCAL_STORAGE_KEY = 'mistica_transactions';
let localListeners = [];

const getLocalTransactions = () => {
  const data = localStorage.getItem(LOCAL_STORAGE_KEY);
  return data ? JSON.parse(data) : [];
};

const saveLocalTransactions = (transactions) => {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(transactions));
  notifyLocalListeners();
};

const notifyLocalListeners = () => {
  const transactions = getLocalTransactions();
  transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  localListeners.forEach(cb => cb(transactions));
};

export const addTransaction = async (data) => {
  const { person, type, amount, description, date } = data;
  
  if (isConfigured()) {
    const firestoreData = {
      person,
      type,
      amount: Number(amount),
      description,
      date: Timestamp.fromDate(new Date(date)),
      createdAt: Timestamp.now()
    };
    return await addDoc(collection(db, 'transactions'), firestoreData);
  } else {
    const transactions = getLocalTransactions();
    const newDoc = {
      id: Date.now().toString() + Math.random().toString(36).substring(7),
      person,
      type,
      amount: Number(amount),
      description,
      date: new Date(date).toISOString(),
      createdAt: new Date().toISOString()
    };
    transactions.push(newDoc);
    saveLocalTransactions(transactions);
    return { id: newDoc.id };
  }
};

export const deleteTransaction = async (id) => {
  if (isConfigured()) {
    await deleteDoc(doc(db, 'transactions', id));
  } else {
    let transactions = getLocalTransactions();
    transactions = transactions.filter(t => t.id !== id);
    saveLocalTransactions(transactions);
  }
};

export const subscribeToTransactions = (callback) => {
  if (isConfigured()) {
    try {
      const q = query(collection(db, 'transactions'), orderBy('date', 'desc'));
      return onSnapshot(q, (snapshot) => {
        const transactions = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data()
        }));
        callback(transactions);
      }, (error) => {
        console.error('Firestore subscription error:', error);
      });
    } catch (error) {
      console.error('Error setting up Firebase subscription:', error);
      return () => {};
    }
  } else {
    console.warn('Firebase is not configured. Falling back to localStorage for transactions.');
    localListeners.push(callback);
    
    // Call immediately with sorted initial data
    const transactions = getLocalTransactions();
    transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    callback(transactions);
    
    return () => {
      localListeners = localListeners.filter(cb => cb !== callback);
    };
  }
};

export const getStats = (transactions) => {
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
