import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBVeGs3mrxYCq8mN0t9uEdZ01KDli357VM",
  authDomain: "nations-conquest.firebaseapp.com",
  projectId: "nations-conquest",
  storageBucket: "nations-conquest.firebasestorage.app",
  messagingSenderId: "667510049675",
  appId: "1:667510049675:web:dc3123d692bcaa44813d8e",
  measurementId: "G-NCJ46BBHN8",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };