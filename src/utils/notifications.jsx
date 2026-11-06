export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getNotificationPermission() {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission() {
  if (!notificationsSupported()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

export async function showGameNotification({ title, body, tag, url = "/" }) {
  if (!notificationsSupported()) return false;
  if (Notification.permission !== "granted") return false;
  const options = {
    body,
    icon: "/logo192.png",
    badge: "/logo192.png",
    tag: tag ?? "nation-conquest-notification",
    renotify: false,
    data: { url },
  };

  //In produzione usiamo il Service Worker, che è il comportamento più adatto a una PWA.
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, options);
      return true;
    } catch (error) {
      console.warn("Notifica tramite Service Worker non disponibile:", error);
    }
  }
  //Fallback utile in sviluppo.
  new Notification(title, options);
  return true;
}

export async function notifyYourTurn({ playerName, roomCode }) {
  //Se l'utente sta già guardando la pagina non serve una notifica di sistema.
  if (typeof document !== "undefined" && document.visibilityState === "visible") return false;
  //Usiamo il pathname reale corrente: così non dipendiamo dal nome della route  definita in React Router.
  const currentUrl = typeof window !== "undefined" ? window.location.pathname + window.location.search + window.location.hash : "/";
  return showGameNotification({
    title: "Nation Conquest — È il tuo turno!",
    body: playerName
      ? `${playerName}, tocca a te. Torna alla partita e scegli la tua mossa.`
      : "Tocca a te. Torna alla partita e scegli la tua mossa.",
    tag: roomCode ? `nation-conquest-turn-${roomCode}` : "nation-conquest-turn",
    url: currentUrl,
  });
}