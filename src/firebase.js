import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

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
  return !!(firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('YOUR_'));
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

/**
 * App Check con reCAPTCHA v3.
 *
 * Se deja inactivo si no hay site key, o en desarrollo, donde reCAPTCHA v3
 * exigiria tokens de depuracion. Es deliberado: si el token falla y las reglas
 * ya exigen App Check, toda la app se queda muda. Se activa el enforcement en
 * la consola solo despues de confirmar aqui que las peticiones salen validadas.
 */
export const isAppCheckActive = () => {
  const siteKey = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY;
  if (!siteKey || import.meta.env.DEV) return false;

  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });

  return true;
};