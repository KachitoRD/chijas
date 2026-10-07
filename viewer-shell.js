const $ = id => document.getElementById(id);
const layout = document.querySelector(".viewer-layout");
const chat = $("communityChat");
const drawer = $("chatDrawer");
const mobile = matchMedia("(max-width: 900px)");
const messages = $("chatMessages");
const samples = [
  ["Lucía", "¿Dónde puedo consultar los resultados publicados?"],
  ["Diego", "En el perfil de cada tipster aparecen sus pronósticos y estados."],
  ["Valeria", "Estoy explorando la categoría de tenis."],
  ["Mateo", "Puedes seguir perfiles y revisarlos en la pestaña Siguiendo."],
  ["Andrea", "Me gusta poder comparar las selecciones antes del evento."],
  ["Luis", "El directorio permite buscar por nombre o usuario."]
];
let sampleIndex = 0;
let paused = false;
let timer = null;

function appendMessage(name, text) {
  const nearBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 64;
  const row = document.createElement("div");
  row.className = "chat-message";
  const avatar = document.createElement("span");
  avatar.className = "chat-avatar";
  avatar.textContent = name.charAt(0).toUpperCase();
  avatar.setAttribute("aria-hidden", "true");
  const paragraph = document.createElement("p");
  const author = document.createElement("strong");
  author.textContent = name;
  paragraph.append(author, document.createTextNode(text));
  row.append(avatar, paragraph);
  messages.append(row);
  if (messages.children.length > 60) {
    const first = messages.firstElementChild;
    const height = first.getBoundingClientRect().height;
    first.remove();
    if (!nearBottom) messages.scrollTop = Math.max(0, messages.scrollTop - height);
  }
  if (nearBottom) messages.scrollTop = messages.scrollHeight;
}
function nextMessage() {
  if (document.hidden || paused || (mobile.matches && !drawer.open)) return;
  appendMessage(...samples[sampleIndex++ % samples.length]);
}
function stopTimer() {
  if (timer !== null) clearInterval(timer);
  timer = null;
}
function startTimer() {
  stopTimer();
  if (!paused) timer = setInterval(nextMessage, 8000);
}
function syncChat() {
  if (mobile.matches) drawer.append(chat);
  else {
    if (drawer.open) drawer.close();
    layout.append(chat);
  }
}
$("toggleChannels").addEventListener("click", () => {
  const collapsed = layout.classList.toggle("channels-collapsed");
  $("toggleChannels").setAttribute("aria-expanded", String(!collapsed));
  $("toggleChannels").setAttribute("aria-label", collapsed ? "Mostrar tipsters" : "Reducir barra de tipsters");
});
$("openChat").addEventListener("click", () => {
  drawer.showModal();
  $("openChat").setAttribute("aria-expanded", "true");
  messages.scrollTop = messages.scrollHeight;
});
$("closeChat").addEventListener("click", () => drawer.close());
drawer.addEventListener("close", () => $("openChat").setAttribute("aria-expanded", "false"));
drawer.addEventListener("click", event => {
  if (event.target !== drawer) return;
  const bounds = drawer.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right
    || event.clientY < bounds.top || event.clientY > bounds.bottom) drawer.close();
});
$("pauseChat").addEventListener("click", () => {
  paused = !paused;
  $("pauseChat").textContent = paused ? "Reanudar demo" : "Pausar demo";
  $("pauseChat").setAttribute("aria-pressed", String(paused));
  startTimer();
});
$("chatForm").addEventListener("submit", event => {
  event.preventDefault();
  const text = $("chatInput").value.trim();
  if (!text) {
    $("chatNotice").textContent = "Escribe un mensaje antes de enviarlo.";
    $("chatInput").focus();
    return;
  }
  appendMessage("Tú", text);
  $("chatInput").value = "";
  $("chatNotice").textContent = "Mensaje añadido a esta demo. No se publica ni se guarda.";
  messages.scrollTop = messages.scrollHeight;
  $("chatInput").focus();
});
for (let index = 0; index < 6; index++) appendMessage(...samples[sampleIndex++ % samples.length]);
syncChat();
startTimer();
mobile.addEventListener("change", syncChat);
addEventListener("pagehide", stopTimer);
addEventListener("pageshow", startTimer);
