import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// IMPORTANT: The user needs to replace these values with their own Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDJKPez9yOcoDGdjIGJ8LTJPlOfUl7VPEE",
  authDomain: "mistica-contable.firebaseapp.com",
  projectId: "mistica-contable",
  storageBucket: "mistica-contable.firebasestorage.app",
  messagingSenderId: "998491105754",
  appId: "1:998491105754:web:5d7da629c391382ae3f8e3",
  measurementId: "G-XZGLEC8574"
};

export const isConfigured = () => {
  const configured = !!(firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('YOUR_'));
  console.log(
    '[Mistica][firebase] isConfigured:', configured,
    '| projectId:', firebaseConfig.projectId
  );
  return configured;
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
