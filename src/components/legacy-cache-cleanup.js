(async () => {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) await registration.unregister();

    const cacheNames = await caches.keys();
    for (const name of cacheNames) {
      if (name.includes("fijas-v1") || name.includes("fijas-v")) await caches.delete(name);
    }
  } catch (error) {
    console.warn("No se pudieron limpiar los registros o caches antiguos:", error);
  }
})();
