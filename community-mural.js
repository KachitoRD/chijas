import { firebaseAuth, firebaseDb as db, firebaseConfigured } from "./firebase-config.js?v=2";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection, deleteDoc, doc, getDoc, limit, onSnapshot, orderBy, query,
  serverTimestamp, setDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { watchAccountPermissions } from "./permissions.js";
import { MURAL_RATE_LIMIT_MS, normalizeBlockedTerms, validateMuralComment } from "./mural-moderation.js";

const TERMS_VERSION = "2026-10-03";
const $ = id => document.getElementById(id);

export function mountCommunityMural() {
  const entries = $("muralEntries");
  if (!firebaseConfigured || !firebaseAuth || !db) {
    $("muralStatus").textContent = "El mural no está disponible porque Firebase no está configurado.";
    return;
  }

  let user = null;
  let accountActive = false;
  let accountReady = false;
  let termsAccepted = false;
  let policyReady = false;
  let blockedTerms = [];
  let muted = false;
  let isSubmitting = false;
  let dashboardOpen = false;
  let selectedPick = null;
  let comments = [];
  let mutedUids = new Set();
  let canModerateCommunity = false;
  let lastCommentAt = 0;
  let threadGeneration = 0;
  let authGeneration = 0;
  let rateTimer = null;
  let userStops = [];
  let stopPermissions = null;
  let stopComments = null;
  let stopOwnMute = null;
  let stopMuteFeed = null;

  function clearThreadListeners() {
    for (const stop of [stopComments, stopOwnMute, stopMuteFeed]) {
      if (stop) stop();
    }
    stopComments = null;
    stopOwnMute = null;
    stopMuteFeed = null;
  }

  function clearUserListeners() {
    userStops.forEach(stop => stop());
    userStops = [];
    if (stopPermissions) stopPermissions();
    stopPermissions = null;
    if (rateTimer) clearInterval(rateTimer);
    rateTimer = null;
  }

  function setNotice(text, error = false) {
    const notice = $("muralNotice");
    notice.textContent = text;
    notice.dataset.error = String(error);
  }

  function postingReason() {
    if (!selectedPick || dashboardOpen) return "Selecciona un pronóstico para comentar.";
    if (!user) return "Inicia sesión con una cuenta verificada para comentar.";
    if (user.isAnonymous || !user.emailVerified) return "Verifica tu correo antes de comentar.";
    if (!accountReady) return "Comprobando el estado de tu cuenta…";
    if (!accountActive) return "Esta cuenta no puede publicar comentarios.";
    if (!termsAccepted) return "Acepta los términos vigentes para participar en la comunidad.";
    if (!policyReady) return "No se pudo cargar el filtro comunitario. Inténtalo de nuevo más tarde.";
    if (muted) return "Un moderador te silenció en este hilo.";
    const remaining = Math.ceil((lastCommentAt + MURAL_RATE_LIMIT_MS - Date.now()) / 1000);
    if (remaining > 0) return `Podrás publicar otro comentario en ${remaining} s.`;
    return "No publiques datos personales ni enlaces externos.";
  }

  function updateComposer() {
    const activeThread = Boolean(selectedPick) && !dashboardOpen;
    const verified = Boolean(user && user.emailVerified && !user.isAnonymous);
    const remaining = lastCommentAt + MURAL_RATE_LIMIT_MS - Date.now();
    const allowed = activeThread && verified && accountReady && accountActive
      && termsAccepted && policyReady && !muted && remaining <= 0 && !isSubmitting;
    $("muralForm").hidden = !activeThread;
    $("muralInput").disabled = !allowed;
    $("muralSend").disabled = !allowed;
    const canRequestConsent = Boolean(user && verified && accountReady && !termsAccepted);
    $("muralSignIn").hidden = !activeThread || (Boolean(user) && !canRequestConsent);
    $("muralSignIn").textContent = user ? "Aceptar términos" : "Iniciar sesión para comentar";
    setNotice(postingReason());
  }

  function formatTime(value) {
    const date = value?.toDate?.() || (value instanceof Date ? value : new Date(value || ""));
    if (!Number.isFinite(date.getTime())) return null;
    return date;
  }

  function createEmptyState(text) {
    const empty = document.createElement("p");
    empty.id = "muralEmptyState";
    empty.className = "mural-empty-state";
    empty.textContent = text;
    return empty;
  }

  function renderComments() {
    const wasNearBottom = entries.scrollHeight - entries.scrollTop - entries.clientHeight < 80;
    entries.replaceChildren();
    if (!selectedPick) {
      entries.append(createEmptyState("Selecciona un pronóstico para ver y dejar comentarios sobre esa fija."));
      return;
    }
    if (!comments.length) {
      entries.append(createEmptyState("Todavía no hay comentarios en este hilo. Inicia la conversación con respeto."));
      return;
    }
    for (const comment of comments) {
      const card = document.createElement("article");
      card.className = "mural-entry";

      const heading = document.createElement("div");
      heading.className = "mural-entry-heading";
      const identity = document.createElement("div");
      identity.className = "mural-entry-identity";
      const name = typeof comment.authorName === "string" && comment.authorName.trim()
        ? comment.authorName.trim() : "Miembro";
      const avatar = document.createElement("span");
      avatar.className = "mural-avatar";
      avatar.setAttribute("aria-hidden", "true");
      avatar.textContent = name.charAt(0).toLocaleUpperCase("es");
      const author = document.createElement("strong");
      author.className = "mural-author";
      author.textContent = name;
      const badge = document.createElement("span");
      badge.className = "mural-comment-badge";
      badge.textContent = comment.authorUid === selectedPick.ownerUid ? "Tipster aprobado" : "Correo verificado";
      identity.append(avatar, author, badge);

      const timestamp = formatTime(comment.created_at);
      const time = document.createElement("time");
      time.className = "mural-time";
      if (timestamp) {
        time.dateTime = timestamp.toISOString();
        time.textContent = new Intl.DateTimeFormat(navigator.language || "es", {
          dateStyle: "medium", timeStyle: "short"
        }).format(timestamp);
      } else {
        time.textContent = "Fecha no disponible";
      }
      heading.append(identity, time);

      const text = document.createElement("p");
      text.className = "mural-comment-text";
      text.textContent = typeof comment.text === "string" ? comment.text : "";
      card.append(heading, text);

      const moderator = Boolean(user && (user.uid === selectedPick.ownerUid || canModerateCommunity));
      const canDelete = moderator || user?.uid === comment.authorUid;
      if (canDelete || (moderator && user.uid !== comment.authorUid)) {
        const controls = document.createElement("div");
        controls.className = "mural-entry-actions";
        if (canDelete) {
          const remove = document.createElement("button");
          remove.type = "button";
          remove.className = "mural-moderation-button";
          remove.textContent = "Eliminar";
          remove.setAttribute("aria-label", `Eliminar comentario de ${name}`);
          remove.addEventListener("click", () => removeComment(comment));
          controls.append(remove);
        }
        if (moderator && user.uid !== comment.authorUid) {
          const muteButton = document.createElement("button");
          muteButton.type = "button";
          muteButton.className = "mural-moderation-button";
          muteButton.textContent = mutedUids.has(comment.authorUid) ? "Retirar silencio" : "Silenciar autor";
          muteButton.setAttribute("aria-label", `${mutedUids.has(comment.authorUid) ? "Retirar silencio a" : "Silenciar"} ${name}`);
          muteButton.addEventListener("click", () => toggleMute(comment));
          controls.append(muteButton);
        }
        card.append(controls);
      }
      entries.append(card);
    }
    if (wasNearBottom) entries.scrollTop = entries.scrollHeight;
  }

  function canModeratePick() {
    return Boolean(user && selectedPick
      && (user.uid === selectedPick.ownerUid || canModerateCommunity));
  }

  function subscribeMuteFeed(pickId, generation) {
    if (stopMuteFeed) stopMuteFeed();
    stopMuteFeed = null;
    mutedUids = new Set();
    if (!canModeratePick()) {
      renderComments();
      return;
    }
    const mutes = query(collection(db, "picks", pickId, "commentMutes"), limit(100));
    stopMuteFeed = onSnapshot(mutes, snapshot => {
      if (generation !== threadGeneration) return;
      mutedUids = new Set(snapshot.docs.map(item => item.id));
      muted = mutedUids.has(user.uid);
      renderComments();
      updateComposer();
    }, error => {
      if (generation !== threadGeneration) return;
      console.error("No se pudo cargar la moderación del hilo:", error);
      setNotice("No se pudo cargar la moderación del hilo. Vuelve a intentarlo.", true);
    });
  }

  function subscribeThread(pickId, generation) {
    const source = query(
      collection(db, "picks", pickId, "comments"),
      orderBy("created_at", "desc"),
      limit(50)
    );
    stopComments = onSnapshot(source, snapshot => {
      if (generation !== threadGeneration) return;
      comments = snapshot.docs.map(item => ({ ...item.data(), id: item.id })).reverse();
      $("muralStatus").textContent = comments.length
        ? `${comments.length} comentarios recientes · hilo actualizado en tiempo real`
        : "Aún no hay comentarios · este hilo se actualiza en tiempo real";
      renderComments();
    }, error => {
      if (generation !== threadGeneration) return;
      console.error("No se pudo cargar el hilo del mural:", error);
      $("muralStatus").textContent = "No se pudo cargar este hilo. Comprueba el acceso y vuelve a intentarlo.";
      renderComments();
    });
  }

  async function openThread(pickId) {
    if (typeof pickId !== "string" || !pickId || pickId.length > 128 || pickId.includes("/")) {
      $("muralStatus").textContent = "No se pudo abrir un identificador de pronóstico válido.";
      return;
    }
    const generation = ++threadGeneration;
    clearThreadListeners();
    selectedPick = { id: pickId, ownerUid: null };
    comments = [];
    muted = false;
    mutedUids = new Set();
    $("muralContext").textContent = "Cargando pronóstico…";
    $("muralStatus").textContent = "Cargando comentarios…";
    renderComments();
    updateComposer();
    if (dashboardOpen) return;

    try {
      const pickSnapshot = await getDoc(doc(db, "picks", pickId));
      if (generation !== threadGeneration) return;
      if (!pickSnapshot.exists()) {
        selectedPick = null;
        $("muralContext").textContent = "Pronóstico no disponible";
        $("muralStatus").textContent = "El pronóstico ya no existe o no está disponible.";
        renderComments();
        updateComposer();
        return;
      }
      const pick = pickSnapshot.data();
      if (typeof pick.user_id !== "string" || !pick.user_id) throw new Error("El pronóstico no tiene propietario válido.");
      selectedPick = { id: pickId, ownerUid: pick.user_id };
      const sport = typeof pick.sport === "string" && pick.sport ? pick.sport : "Pronóstico";
      const event = typeof pick.event === "string" && pick.event ? pick.event : "Evento";
      $("muralContext").textContent = `${sport} · ${event}`;
      subscribeThread(pickId, generation);
      if (user?.emailVerified && !user.isAnonymous) {
        stopOwnMute = onSnapshot(doc(db, "picks", pickId, "commentMutes", user.uid), snapshot => {
          if (generation !== threadGeneration) return;
          muted = snapshot.exists();
          updateComposer();
        }, error => {
          if (generation !== threadGeneration) return;
          console.error("No se pudo comprobar el silencio del usuario:", error);
          setNotice("No se pudo comprobar si puedes participar en este hilo.", true);
        });
      }
      subscribeMuteFeed(pickId, generation);
      renderComments();
      updateComposer();
    } catch (error) {
      if (generation !== threadGeneration) return;
      console.error("No se pudo abrir el pronóstico para el mural:", error);
      selectedPick = null;
      $("muralContext").textContent = "No se pudo abrir el pronóstico";
      $("muralStatus").textContent = "No se pudo cargar el pronóstico. Comprueba tu conexión e inténtalo de nuevo.";
      renderComments();
      updateComposer();
    }
  }

  async function removeComment(comment) {
    if (!selectedPick || !user) return;
    if (!window.confirm("¿Eliminar este comentario? Esta acción no se puede deshacer.")) return;
    try {
      await deleteDoc(doc(db, "picks", selectedPick.id, "comments", comment.id));
      setNotice("Comentario eliminado.");
    } catch (error) {
      console.error("No se pudo eliminar el comentario:", error);
      setNotice(error.code === "permission-denied"
        ? "No tienes permiso para eliminar este comentario."
        : "No se pudo eliminar el comentario. Inténtalo de nuevo.", true);
    }
  }

  async function toggleMute(comment) {
    if (!selectedPick || !user || !canModeratePick() || user.uid === comment.authorUid) return;
    const muteRef = doc(db, "picks", selectedPick.id, "commentMutes", comment.authorUid);
    try {
      const existing = await getDoc(muteRef);
      if (existing.exists()) {
        await deleteDoc(muteRef);
        setNotice("Silencio retirado para este hilo.");
      } else {
        await setDoc(muteRef, {
          muted_uid: comment.authorUid,
          source_comment_id: comment.id,
          created_by: user.uid,
          created_at: serverTimestamp()
        });
        setNotice("Usuario silenciado en este hilo.");
      }
    } catch (error) {
      console.error("No se pudo actualizar el silencio del usuario:", error);
      setNotice(error.code === "permission-denied"
        ? "No tienes permiso para moderar este hilo."
        : "No se pudo actualizar el silencio. Inténtalo de nuevo.", true);
    }
  }

  function watchUser(userValue, generation) {
    clearUserListeners();
    user = userValue;
    accountReady = false;
    accountActive = false;
    termsAccepted = false;
    policyReady = false;
    blockedTerms = [];
    lastCommentAt = 0;
    canModerateCommunity = false;
    muted = false;
    if (!user || user.isAnonymous || !user.emailVerified) {
      updateComposer();
      return;
    }

    userStops.push(onSnapshot(doc(db, "users", user.uid), snapshot => {
      if (generation !== authGeneration || user?.uid !== userValue.uid) return;
      accountReady = snapshot.exists();
      accountActive = snapshot.exists() && snapshot.data().role === "viewer"
        && snapshot.data().status !== "suspended";
      updateComposer();
    }, error => {
      if (generation !== authGeneration) return;
      console.error("No se pudo comprobar el estado de la cuenta del mural:", error);
      accountReady = false;
      accountActive = false;
      updateComposer();
    }));

    userStops.push(onSnapshot(doc(db, "legalAcceptances", user.uid, "versions", TERMS_VERSION), snapshot => {
      if (generation !== authGeneration) return;
      const acceptance = snapshot.data();
      termsAccepted = snapshot.exists() && acceptance.terms_version === TERMS_VERSION
        && acceptance.privacy_version === TERMS_VERSION;
      updateComposer();
    }, error => {
      if (generation !== authGeneration) return;
      console.error("No se pudo comprobar el consentimiento comunitario:", error);
      termsAccepted = false;
      updateComposer();
    }));

    userStops.push(onSnapshot(doc(db, "platformSettings", "communityModeration"), snapshot => {
      if (generation !== authGeneration) return;
      try {
        const raw = snapshot.exists() ? snapshot.data().blockedTerms : "";
        blockedTerms = normalizeBlockedTerms(raw).split("\n").filter(Boolean);
        policyReady = true;
        updateComposer();
      } catch (error) {
        console.error("La configuración del filtro comunitario no es válida:", error);
        policyReady = false;
        updateComposer();
      }
    }, error => {
      if (generation !== authGeneration) return;
      console.error("No se pudo cargar el filtro comunitario:", error);
      policyReady = false;
      updateComposer();
    }));

    userStops.push(onSnapshot(doc(db, "commentRateLimits", user.uid), snapshot => {
      if (generation !== authGeneration) return;
      const lastAt = snapshot.data()?.last_at;
      lastCommentAt = lastAt?.toDate?.()?.getTime() || 0;
      updateComposer();
      if (lastCommentAt && !rateTimer) {
        rateTimer = setInterval(() => {
          updateComposer();
          if (Date.now() >= lastCommentAt + MURAL_RATE_LIMIT_MS) {
            clearInterval(rateTimer);
            rateTimer = null;
          }
        }, 1000);
      }
      if (!lastCommentAt && rateTimer) {
        clearInterval(rateTimer);
        rateTimer = null;
      }
    }, error => {
      if (generation !== authGeneration) return;
      console.error("No se pudo comprobar el intervalo de publicación:", error);
      setNotice("No se pudo comprobar el intervalo de publicación. Inténtalo de nuevo.", true);
    }));

    stopPermissions = watchAccountPermissions(user, permissions => {
      if (generation !== authGeneration) return;
      canModerateCommunity = permissions.canModerateCommunity === true;
      if (selectedPick && !dashboardOpen) subscribeMuteFeed(selectedPick.id, threadGeneration);
      renderComments();
    }, error => {
      if (generation !== authGeneration) return;
      console.error("No se pudieron comprobar los permisos comunitarios:", error);
      canModerateCommunity = false;
      renderComments();
      setNotice("No se pudieron comprobar los permisos de moderación.", true);
    });
    updateComposer();
  }

  $("muralForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (!selectedPick || !user || isSubmitting || dashboardOpen) return;
    const result = validateMuralComment($("muralInput").value, blockedTerms);
    if (!result.valid) {
      const messages = {
        empty: "Escribe un comentario antes de publicarlo.",
        "too-long": "El comentario supera el límite de 500 caracteres.",
        "external-link": "No se permiten enlaces externos en el mural.",
        "blocked-term": "El comentario contiene un término bloqueado.",
        invalid: "El comentario no tiene un formato válido."
      };
      setNotice(messages[result.reason] || "No se pudo validar el comentario.", true);
      return;
    }
    if (Date.now() < lastCommentAt + MURAL_RATE_LIMIT_MS) {
      updateComposer();
      return;
    }
    const authorName = user.displayName?.trim() || "Miembro";
    if (authorName.length > 120) {
      setNotice("Tu nombre público supera el límite permitido. Actualízalo en tu perfil antes de comentar.", true);
      return;
    }
    const pickId = selectedPick.id;
    const comment = doc(collection(db, "picks", pickId, "comments"));
    const rateLimit = doc(db, "commentRateLimits", user.uid);
    isSubmitting = true;
    updateComposer();
    const batch = writeBatch(db);
    batch.set(comment, {
      authorUid: user.uid,
      authorName,
      text: result.text,
      created_at: serverTimestamp()
    });
    batch.set(rateLimit, {
      last_at: serverTimestamp(),
      last_pick_id: pickId,
      last_comment_id: comment.id
    });
    try {
      await batch.commit();
      if (selectedPick?.id === pickId) $("muralInput").value = "";
      setNotice("Comentario publicado.");
    } catch (error) {
      console.error("No se pudo publicar el comentario:", error);
      const message = error.code === "permission-denied"
        ? "No se pudo publicar: revisa el consentimiento, las reglas del hilo y el intervalo de 10 segundos."
        : "No se pudo publicar el comentario. Comprueba la conexión e inténtalo de nuevo.";
      setNotice(message, true);
    } finally {
      isSubmitting = false;
      updateComposer();
    }
  });

  $("muralSignIn").addEventListener("click", () => {
    if (!user) {
      $("viewerLogin").click();
      return;
    }
    if (!user.emailVerified || termsAccepted) return;
    void new Promise(resolve => window.dispatchEvent(new CustomEvent("fijas:request-viewer-consent", {
      detail: { resolve }
    }))).then(accepted => {
      if (!accepted) setNotice("El consentimiento es necesario para comentar.");
    });
  });

  window.addEventListener("fijas:mural-open", event => {
    const pickId = event.detail?.pickId;
    if (dashboardOpen) return;
    void openThread(pickId);
  });

  window.addEventListener("fijas:dashboard", event => {
    dashboardOpen = event.detail?.open === true;
    if (dashboardOpen) {
      threadGeneration++;
      clearThreadListeners();
      $("muralStatus").textContent = "El mural se oculta mientras usas un panel.";
      updateComposer();
    } else if (selectedPick) {
      void openThread(selectedPick.id);
    }
  });

  onAuthStateChanged(firebaseAuth, nextUser => {
    authGeneration++;
    clearUserListeners();
    clearThreadListeners();
    user = nextUser;
    canModerateCommunity = false;
    watchUser(nextUser, authGeneration);
    if (selectedPick && !dashboardOpen) void openThread(selectedPick.id);
  }, error => {
    console.error("No se pudo comprobar la sesión del mural:", error);
    $("muralStatus").textContent = "No se pudo comprobar tu sesión. Recarga la página para volver a intentarlo.";
  });
}
