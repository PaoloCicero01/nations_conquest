import React from "react";
import ReactDOM from "react-dom/client";

import {
  BrowserRouter,
} from "react-router-dom";

import App from "./App";

import {
  AuthProvider,
} from "./context/AuthContext";

import {
  registerServiceWorker,
} from "./serviceWorkerRegistration";

import "./index.css";

const rootElement = document.getElementById("root"); //riferimento alla nostra applicazione react

const root = ReactDOM.createRoot(rootElement); //crea la root react

//Rendering dei componenti
root.render(
  <React.StrictMode>
    <BrowserRouter> {/* Gestione navigazione tra le pagine*/}
      <AuthProvider> {/* Gestione autenticazione*/}
        <App /> {/* Chiama la funzione App */}
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

registerServiceWorker(); {/* Per la funzionalità PWA */}