export function registerServiceWorker() {
  if(process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
    return;
  }
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/service-worker.js");
      console.log("Service worker registrato:",registration.scope);
    } catch (error) {
      console.error("Errore durante la registrazione del service worker:", error);
    }
  });
}