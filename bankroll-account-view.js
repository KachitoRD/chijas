import { bankrollCurrencies, parseBankrollOpening, parseBankrollStake, bankrollAccountBalance, bankrollMovementsCSV } from "./bankroll.js";
import { firebaseAuth, firebaseDb } from "./firebase-config.js?v=2";
import { collection, doc, onSnapshot, orderBy, query, runTransaction, serverTimestamp, where } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// Deliberately independent of the history period, pagination and currentPicks.
export function mountBankrollAccountView(root, user, download) {
  const $ = name => root.querySelector(`[data-testid="bankroll-${name}"]`);
  const controller = new AbortController();
  let disposed = false, generation = 0, currency = "PEN", access = false, legalLoading = true;
  let account = null, accountReady = false, movements = [], movementsReady = false;
  let picks = [], picksReady = false, error = "", draft = null, saving = false;
  const stops = new Set(), privateStops = new Map(), records = new Map();
  const alive = () => !disposed && firebaseAuth.currentUser?.uid === user.uid;
  const money = amount => new Intl.NumberFormat("es-PE", { style: "currency", currency }).format(amount / 100);
  const accountRef = () => doc(firebaseDb, "users", user.uid, "bankrollAccounts", currency);
  function clearSubscriptions() {
    generation++;
    stops.forEach(stop => stop());
    stops.clear();
    privateStops.forEach(stop => stop());
    privateStops.clear();
    records.clear();
  }
  function resetData() {
    account = null; accountReady = false; movements = []; movementsReady = false;
    picks = []; picksReady = false; records.clear();
    $("export-status").textContent = "";
  }
  function fail() {
    if (!alive()) return;
    clearSubscriptions();
    resetData();
    error = "No se pudo cargar el bankroll completo. Comprueba tu conexión y acceso; luego pulsa Reintentar carga.";
    render();
  }
  function watch(ref, next, current) {
    const stop = onSnapshot(ref, { includeMetadataChanges: true }, snapshot => {
      if (alive() && access && current === generation) next(snapshot);
    }, () => { if (alive() && current === generation) fail(); });
    stops.add(stop);
  }
  const committed = snapshot => !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites;
  function ready() {
    return accountReady && (!account || (movementsReady && picksReady && picks.every(pick => records.has(pick.id))));
  }
  function render() {
    if (!alive()) return;
    const loaded = ready() && !error && access;
    const controlsLocked = !loaded || saving || Boolean(draft);
    $("export-movements").disabled = true;
    $("account").setAttribute("aria-busy", String(legalLoading || (!loaded && !error && access)));
    $("currency").disabled = saving || Boolean(draft) || !access;
    $("opening-form").hidden = !loaded || Boolean(account);
    $("movement-form").hidden = !loaded || !account;
    for (const form of [$("opening-form"), $("movement-form")]) {
      for (const control of form.elements) control.disabled = controlsLocked;
    }
    $("confirmation").hidden = !draft;
    $("confirm").disabled = saving || !access;
    $("confirm").textContent = saving ? "Guardando…" : draft?.attempted ? "Comprobar y reintentar" : "Confirmar registro";
    $("cancel").hidden = Boolean(draft?.attempted);
    $("cancel").disabled = saving;
    $("retry").hidden = !error || !access;
    $("retry").disabled = saving;
    $("balance").replaceChildren();
    $("movements").replaceChildren();
    $("account-warning").textContent = "";
    const status = $("account-status");
    status.dataset.state = legalLoading ? "loading" : !access || error ? "error" : !loaded ? "loading" : !account ? "empty" : "ready";
    status.textContent = legalLoading ? "Comprobando aceptación legal…"
      : !access ? "Acceso al bankroll desactivado. No se muestran datos privados."
      : error || (!loaded ? "Cargando apertura, movimientos e importes privados…"
        : !account ? `Sin apertura en ${currency}. Registra un saldo inicial, incluso cero.`
          : `Apertura: ${account.created_at.toDate().toLocaleString("es-PE")}. Registro privado en ${currency}.`);
    if (!loaded || !account) return;
    try {
      const balance = bankrollAccountBalance(account, movements, picks, records);
      for (const [key, label, value] of [
        ["initial", "Saldo inicial", account.initialMinorUnits], ["deposits", "Depósitos", balance.deposits],
        ["withdrawals", "Retiros", balance.withdrawals], ["profit", "Resultado de picks", balance.profit],
        ["equity", "Saldo contable", balance.equity], ["risk", "En riesgo", balance.risk],
        ["available", "Disponible contable", balance.available]
      ]) {
        const group = document.createElement("div");
        const title = document.createElement("dt");
        const amount = document.createElement("dd");
        title.textContent = label;
        amount.textContent = money(value);
        amount.dataset.testid = `bankroll-${key}`;
        if (value < 0) amount.dataset.negative = "true";
        group.append(title, amount);
        $("balance").append(group);
      }
      $("account-warning").textContent = `${balance.financialCount} picks con importe en ${currency}; ${balance.withoutAmount} sin importe, excluidos del cálculo. Picks anteriores o iguales a la apertura excluidos. Ganadas: retornos teóricos según cuota; anuladas: devolución. Cash out: retorno privado registrado.`;
      for (const movement of movements) {
        const item = document.createElement("li");
        item.dataset.testid = "bankroll-movement-row";
        const description = document.createElement("span");
        description.textContent = `${movement.type === "deposit" ? "Depósito" : "Retiro"} · ${money(movement.amountMinorUnits)} · ${movement.created_at.toDate().toLocaleString("es-PE")}`;
        const note = document.createElement("p");
        note.textContent = movement.note;
        item.append(description, note);
        $("movements").append(item);
      }
      $("movement-empty").hidden = movements.length > 0;
      $("export-movements").disabled = controlsLocked;
    } catch {
      $("balance").replaceChildren();
      error = "El registro contiene datos incompletos o inválidos; no se muestra un saldo parcial. Reintenta la carga.";
      render();
    }
  }
  function synchronizePrivate(current) {
    const ids = new Set(picks.map(pick => pick.id));
    for (const [id, stop] of privateStops) {
      if (!ids.has(id)) { stop(); privateStops.delete(id); records.delete(id); }
    }
    for (const pick of picks) {
      if (privateStops.has(pick.id)) continue;
      const stop = onSnapshot(doc(firebaseDb, "picks", pick.id, "private", "bankroll"),
        { includeMetadataChanges: true }, snapshot => {
          if (!alive() || !access || current !== generation) return;
          if (committed(snapshot)) records.set(pick.id, snapshot.exists() ? snapshot.data() : null);
          else records.delete(pick.id);
          render();
        }, () => { if (alive() && current === generation) fail(); });
      privateStops.set(pick.id, stop);
    }
  }
  function subscribe() {
    if (!alive() || !access) return;
    clearSubscriptions();
    resetData();
    error = "";
    render();
    const current = generation, ref = accountRef();
    let childrenStarted = false;
    watch(ref, snapshot => {
      accountReady = committed(snapshot);
      if (!accountReady) { render(); return; }
      account = snapshot.exists() ? snapshot.data() : null;
      if (account && !childrenStarted) {
        if (!account.created_at?.toMillis) { fail(); return; }
        childrenStarted = true;
        watch(query(collection(ref, "movements"), orderBy("created_at", "desc")), snapshot => {
          movementsReady = committed(snapshot);
          movements = movementsReady ? snapshot.docs.map(item => ({ id: item.id, ...item.data() })) : [];
          render();
        }, current);
        watch(query(collection(firebaseDb, "picks"), where("user_id", "==", user.uid),
          where("created_at", ">", account.created_at), orderBy("created_at", "desc")), snapshot => {
          picksReady = committed(snapshot);
          if (picksReady) {
            picks = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
            synchronizePrivate(current);
          }
          render();
        }, current);
      }
      render();
    }, current);
  }
  function review(kind) {
    if (!alive() || !access || !ready() || error || draft || saving) return;
    try {
      const ref = accountRef();
      const data = kind === "opening"
        ? { currency, initialMinorUnits: parseBankrollOpening($("opening-amount").value, currency) }
        : { type: $("movement-type").value,
          amountMinorUnits: parseBankrollStake($("movement-amount").value, currency)?.stakeMinorUnits,
          note: $("movement-note").value.trim() };
      if (kind === "movement" && (!["deposit", "withdrawal"].includes(data.type)
        || !data.amountMinorUnits || data.note.length > 200)) throw new Error("Indica un movimiento positivo y una nota de hasta 200 caracteres.");
      draft = { ref: kind === "opening" ? ref : doc(collection(ref, "movements")), data, kind, attempted: false };
      $("confirmation-text").textContent = kind === "opening"
        ? `Abrir ${currency} con ${money(data.initialMinorUnits)}. Solo contarán picks publicados después del timestamp de apertura del servidor. La apertura no se puede editar.`
        : `${data.type === "deposit" ? "Depósito" : "Retiro"} de ${money(data.amountMinorUnits)}. Nota: ${data.note || "Sin nota"}. El movimiento no se puede editar ni eliminar.`;
      $("write-status").textContent = "";
      render();
      $("confirm").focus();
    } catch (failure) { $("write-status").textContent = failure.message; }
  }
  async function confirm() {
    if (!alive() || !access || !draft || saving) return;
    const operation = draft;
    operation.attempted = true;
    saving = true;
    render();
    try {
      // Retain the same ref/data on retry. An acknowledged write is never repeated.
      await runTransaction(firebaseDb, async transaction => {
        if (!alive() || !access || draft !== operation) throw new Error("La sesión cambió; no se registró el movimiento.");
        const existing = await transaction.get(operation.ref);
        if (!alive() || !access || draft !== operation) throw new Error("La sesión cambió.");
        if (existing.exists()) {
          const data = existing.data();
          if (!Object.entries(operation.data).every(([key, value]) => data[key] === value)) {
            throw new Error("Ya existe un registro distinto en esta ruta. Recarga para comprobarlo.");
          }
          return;
        }
        transaction.set(operation.ref, { ...operation.data, created_at: serverTimestamp() });
      });
      if (!alive() || draft !== operation || !access) return;
      draft = null;
      $("opening-form").reset();
      $("movement-form").reset();
      $("write-status").textContent = "Registro guardado. Para rectificar un movimiento, registra explícitamente el movimiento contrario.";
      subscribe();
    } catch (failure) {
      if (alive() && draft === operation && access) {
        $("write-status").textContent = `${failure.message} Comprueba tu acceso y conexión. Reintentar comprueba el mismo registro, sin duplicarlo.`;
      }
    } finally {
      if (alive() && access) { saving = false; render(); }
    }
  }
  function listen(element, event, callback) {
    element.addEventListener(event, callback, { signal: controller.signal });
  }
  for (const item of bankrollCurrencies) {
    const option = document.createElement("option");
    option.value = item.code; option.textContent = item.label;
    $("currency").append(option);
  }
  listen($("currency"), "change", () => {
    if (draft || saving) { $("currency").value = currency; return; }
    currency = $("currency").value;
    $("opening-form").reset(); $("movement-form").reset(); $("write-status").textContent = "";
    subscribe();
  });
  listen($("opening-form"), "submit", event => { event.preventDefault(); review("opening"); });
  listen($("movement-form"), "submit", event => { event.preventDefault(); review("movement"); });
  listen($("confirm"), "click", confirm);
  listen($("cancel"), "click", () => {
    if (saving || draft?.attempted) return;
    const kind = draft?.kind;
    draft = null; render();
    $(kind === "opening" ? "opening-submit" : "movement-submit").focus();
  });
  listen($("retry"), "click", subscribe);
  listen($("export-movements"), "click", () => {
    if (!alive() || !access || !ready() || !account || error || saving || draft) return;
    try {
      const csv = bankrollMovementsCSV(account, movements);
      download(new Blob([csv], { type: "text/csv;charset=utf-8" }), `bankroll-movimientos-${currency}.csv`);
      $("export-status").textContent = `CSV privado de ${currency} generado. Contiene apertura y movimientos; no incluye resultados de picks. Compártelo solo si lo deseas.`;
    } catch (failure) {
      console.error("No se pudieron exportar los movimientos privados:", failure);
      $("export-status").textContent = failure.message || "No se pudo exportar. Reintenta la carga antes de descargar.";
    }
  });
  const stopLegal = onSnapshot(doc(firebaseDb, "legalAcceptances", user.uid, "versions", "2026-10-03"), snapshot => {
    if (!alive()) return;
    const data = snapshot.data();
    if (!committed(snapshot)) return;
    legalLoading = false;
    if (data?.terms_version !== "2026-10-03" || data?.privacy_version !== "2026-10-03" || data?.age_confirmed !== true) revoke();
    else if (!access) { access = true; subscribe(); }
  }, revoke);
  function revoke() {
    if (!alive()) return;
    legalLoading = false; access = false; draft = null; clearSubscriptions(); resetData(); render();
    $("write-status").textContent = "";
  }
  render();
  return () => {
    disposed = true;
    controller.abort();
    stopLegal();
    clearSubscriptions();
    draft = null;
    root.querySelectorAll("input, textarea").forEach(input => { input.value = ""; });
    $("balance").replaceChildren(); $("movements").replaceChildren(); $("currency").replaceChildren();
    $("confirmation").hidden = true;
    $("export-movements").disabled = true;
    $("export-status").textContent = "";
    $("account-status").textContent = ""; $("account-warning").textContent = ""; $("write-status").textContent = "";
  };
}
