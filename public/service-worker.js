const CACHE_NAME = "nation-conquest-v5";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.json",
  "/favicon.ico",
  "/logo192.png",
  "/logo512.png",
];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(async (cache) => {
    for (const url of APP_SHELL) {
      try{
        await cache.add(url);
      }catch (error) {
        console.warn("Impossibile salvare in cache:", url,error);
      }
    }})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([caches.keys().then((cacheNames) => Promise.all(cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))),self.clients.claim()]));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if(request.method !== "GET"){
    return;
  }
  const url = new URL(request.url);
  // Non intercettiamo risorse esterne (Firebase, Google, API esterne, ecc.).
  if (url.origin !== self.location.origin) {
    return;
  }
  // Audio/video possono usare risposte HTTP 206 e non vanno memorizzati così nella Cache API.
  if (request.headers.has("range")) {
    return;
  }
  //Navigazioni React
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok && response.status === 200 && !response.redirected){
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put("/index.html",copy)).catch(() => {}));
      }
    return response;
    })
    .catch(async () => {
      const cachedPage = await caches.match("/index.html");
          if (cachedPage) {
            return cachedPage;
          }
          return new Response("Nation Conquest non è ancora disponibile offline.",{status: 503, headers: {"Content-Type": "text/plain; charset=utf-8"},});
      })
    );
    return;
  }

  //Risorse statiche same-origin
  event.respondWith(caches.match(request).then(async (cachedResponse) => {
    if (cachedResponse) {
      return cachedResponse;
    }
    try {
      const networkResponse = await fetch(request);
      if(networkResponse.ok && networkResponse.status === 200 && networkResponse.type === "basic" && !networkResponse.redirected){
        const copy = networkResponse.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {}));
      }
    return networkResponse;
    }catch(error){
      return new Response("", {status: 504, statusText: "Offline"});
    }
  }));
});

self.addEventListener("notificationclick",(event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  const absoluteTargetUrl = new URL(targetUrl,self.location.origin).href;
  event.waitUntil(self.clients.matchAll({type: "window",includeUncontrolled: true}).then(async (clientList) => {
  for(const client of clientList){
    if(new URL(client.url).origin === self.location.origin){
      if ("navigate" in client && client.url !== absoluteTargetUrl){
        try {
          await client.navigate(absoluteTargetUrl);
        }catch(error){
          console.warn("Impossibile navigare il client:",error);
        }
      }
      if("focus" in client){
        return client.focus();
      }
    }
  }
  if(self.clients.openWindow){
    return self.clients.openWindow(absoluteTargetUrl);
  }
  return undefined;
  }));
});