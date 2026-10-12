(function loadToastModule() {
  const script = document.createElement("script");
  script.type = "module";
  script.src = "/src/components/toasts.js";
  script.onerror = () => console.error("No se pudo cargar el módulo de notificaciones.");
  document.head.append(script);
})();
