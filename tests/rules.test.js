import { createConnection } from "node:net";
import { randomUUID } from "node:crypto";
import {
  deleteApp,
  initializeApp
} from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  reload,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  connectAuthEmulator
} from "firebase/auth";
import {
  collection,
  connectFirestoreEmulator,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc
} from "firebase/firestore";

const PROJECT_ID = "demo-fijas-vivo";
const AUTH_HOST = "127.0.0.1";
const AUTH_PORT = 9099;
const FIRESTORE_HOST = "127.0.0.1";
const FIRESTORE_PORT = 8080;
const AUTH_EMULATOR_URL = `http://${AUTH_HOST}:${AUTH_PORT}`;
const FIRESTORE_EMULATOR_URL = `http://${FIRESTORE_HOST}:${FIRESTORE_PORT}`;
const FIRESTORE_REST_ROOT = `${FIRESTORE_EMULATOR_URL}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const AUTH_UPDATE_URL = `${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-api-key`;
const TEST_PASSWORD = "Test-password-123!";
const CASES = [];

function valueToRest(value) {
  if (value === null) return { nullValue: null };
  if (value instanceof Timestamp) return { timestampValue: value.toDate().toISOString() };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number" && Number.isInteger(value)) return { integerValue: String(value) };
  if (typeof value === "number") return { doubleValue: value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(valueToRest) } };
  if (typeof value === "object" && value !== null) return { mapValue: { fields: documentFields(value) } };
  throw new TypeError(`Unsupported Firestore fixture value: ${String(value)}`);
}

function documentFields(data) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, valueToRest(value)]));
}

async function assertEmulatorPort(host, port, label) {
  await new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    socket.once("error", error => reject(new Error(`${label} emulator unreachable at ${host}:${port}: ${error.message}`)));
    socket.once("connect", () => {
      socket.destroy();
      resolve();
    });
  });
}

async function emulatorRequest(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${body}`);
  }
  return body ? JSON.parse(body) : null;
}

async function clearEmulatorData() {
  await emulatorRequest(`${AUTH_EMULATOR_URL}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
    method: "DELETE"
  });
  await emulatorRequest(`${FIRESTORE_EMULATOR_URL}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, {
    method: "DELETE"
  });
}

async function seedDocument(path, data) {
  const segments = path.split("/").map(encodeURIComponent).join("/");
  const documentName = `projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
  await emulatorRequest(`${FIRESTORE_REST_ROOT}/${segments}`, {
    method: "PATCH",
    headers: {
      authorization: "Bearer owner",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      name: documentName,
      fields: documentFields(data)
    })
  });
}

function profileDocument(uid, status, username) {
  return {
    id: uid,
    username,
    nombre_publico: `Usuario ${username}`,
    bio: null,
    color_primario: "#34d399",
    is_online: false,
    last_active_at: null,
    created_at: new Date("2026-10-04T12:00:00.000Z"),
    tipster_status: status
  };
}

function socialProfileDocument() {
  return {
    avatar_url: null,
    banner_url: null,
    kick_url: null,
    twitch_url: null,
    youtube_url: null,
    telegram_url: null,
    twitter_url: null,
    instagram_url: null
  };
}

function acceptedTerms(uid) {
  return {
    uid,
    terms_version: "2026-10-14",
    privacy_version: "2026-10-14",
    age_confirmed: true,
    accepted_at: new Date("2026-10-04T12:00:00.000Z")
  };
}

async function createTestUser(context, label, status = "approved", options = {}) {
  const email = `${label}-${randomUUID()}@example.test`;
  const credential = await createUserWithEmailAndPassword(context.auth, email, TEST_PASSWORD);
  const user = credential.user;
  await sendEmailVerification(user);
  const { oobCodes } = await emulatorRequest(`${AUTH_EMULATOR_URL}/emulator/v1/projects/${PROJECT_ID}/oobCodes`);
  const verificationCode = oobCodes.find(code => code.email === email && code.requestType === "VERIFY_EMAIL")?.oobCode;
  if (!verificationCode) throw new Error(`Auth emulator did not issue a verification code for ${email}.`);
  const verificationResult = await emulatorRequest(AUTH_UPDATE_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ oobCode: verificationCode })
  });
  if (verificationResult.emailVerified !== true) throw new Error(`Auth emulator did not verify ${email}.`);
  await reload(user);
  if (!user.emailVerified) {
    throw new Error(`Auth emulator did not mark ${email} as verified.`);
  }
  await user.getIdToken(true);

  if (status !== "pending") {
    await seedDocument(`perfiles/${user.uid}`, profileDocument(user.uid, status, label));
    await seedDocument(`perfiles_social/${user.uid}`, socialProfileDocument());
  }
  await seedDocument(`usernames/${label}`, { uid: user.uid });
  await seedDocument(`legalAcceptances/${user.uid}/versions/2026-10-14`, acceptedTerms(user.uid));
  if (options.admin) {
    await seedDocument(`platformAdmins/${user.uid}`, { enabled: true });
  }
  return user;
}

async function signInTestUser(context, user) {
  const credential = await signInWithEmailAndPassword(context.auth, user.email, TEST_PASSWORD);
  await credential.user.getIdToken(true);
}

function validPick(userId, overrides = {}) {
  return {
    user_id: userId,
    sport: "futbol",
    event: "Alianza Lima vs Universitario",
    selection: "Más de 1.5 goles",
    odds: 1.85,
    bookmaker: "betano",
    event_date: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
    league: "Liga 1",
    market: "Total de goles",
    stake: 10,
    analysis: "",
    confianza: 4,
    destacada: false,
    show_on_stream: false,
    status: "pending",
    created_at: serverTimestamp(),
    ...overrides
  };
}

async function seedPick(userId, status = "pending", overrides = {}) {
  const id = `pick-${randomUUID()}`;
  const data = {
    ...validPick(userId, {
      created_at: new Date("2026-10-04T12:00:00.000Z"),
      status,
      ...overrides
    })
  };
  await seedDocument(`picks/${id}`, data);
  return { id, data };
}

async function submitProfileRequest(context, user, changes, requestId = `profile-request-${randomUUID()}`) {
  const requestRef = doc(context.db, "perfilSolicitudes", requestId);
  const reservationRef = doc(context.db, "perfilSolicitudesPendientes", user.uid);
  await runTransaction(context.db, async transaction => {
    const reservation = await transaction.get(reservationRef);
    if (reservation.exists()) throw new Error("El usuario de prueba ya tiene una solicitud pendiente.");
    const createdAt = serverTimestamp();
    transaction.set(requestRef, {
      uid: user.uid,
      cambios: changes,
      estado: "pendiente",
      motivoRechazo: null,
      created_at: createdAt,
      revisado_at: null,
      revisado_por: null
    });
    transaction.set(reservationRef, {
      uid: user.uid,
      solicitud_id: requestId,
      created_at: createdAt
    });
  });
  return { id: requestId, requestRef, reservationRef };
}

async function createContext() {
  const app = initializeApp({
    apiKey: "demo-api-key",
    projectId: PROJECT_ID,
    authDomain: `${PROJECT_ID}.firebaseapp.com`,
    appId: `1:${PROJECT_ID}:web:${randomUUID()}`
  }, `rules-test-${randomUUID()}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, AUTH_EMULATOR_URL, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, FIRESTORE_HOST, FIRESTORE_PORT);
  return { app, auth, db };
}

async function withCleanEmulators(test) {
  await clearEmulatorData();
  const context = await createContext();
  try {
    return await test(context);
  } finally {
    if (context.auth.currentUser) await signOut(context.auth);
    await deleteApp(context.app);
  }
}

function formatError(error) {
  return error?.code ? `${error.code}: ${error.message}` : String(error);
}

async function expectDenied(operation, label, verifyRuleEvaluation = false) {
  try {
    await operation();
  } catch (error) {
    if (error.code === "permission-denied") {
      if (verifyRuleEvaluation && error.message.includes("maximum of 1000 expressions")) {
        throw new Error(`${label} fue denegado por límite de evaluación, no por una regla concluyente: ${formatError(error)}`);
      }
      return;
    }
    throw new Error(`${label} produjo un error inesperado: ${formatError(error)}`);
  }
  throw new Error(`${label} fue permitido; se esperaba permission-denied.`);
}

async function runCase(name, test) {
  try {
    await withCleanEmulators(test);
    CASES.push({ name, passed: true });
    console.log(`[OK] ${name}`);
  } catch (error) {
    CASES.push({ name, passed: false, error });
    console.log(`[FALLO] ${name} — ${formatError(error)}`);
  }
}

async function setupSeededPick(context, user, status = "pending") {
  return seedPick(user.uid, status);
}

async function main() {
  if (PROJECT_ID !== "demo-fijas-vivo" || !AUTH_EMULATOR_URL.startsWith("http://127.0.0.1:")
    || !FIRESTORE_EMULATOR_URL.startsWith("http://127.0.0.1:")) {
    throw new Error("Safety check: tests must target only the local demo project emulators.");
  }
  await assertEmulatorPort(AUTH_HOST, AUTH_PORT, "Auth");
  await assertEmulatorPort(FIRESTORE_HOST, FIRESTORE_PORT, "Firestore");
  await clearEmulatorData();

  await runCase("Aceptación legal vigente: permite crear 2026-10-14", async context => {
    const credential = await createUserWithEmailAndPassword(
      context.auth,
      `legal-acceptance-${randomUUID()}@example.test`,
      TEST_PASSWORD
    );
    const user = credential.user;
    await setDoc(doc(context.db, "legalAcceptances", user.uid, "versions", "2026-10-14"), {
      uid: user.uid,
      terms_version: "2026-10-14",
      privacy_version: "2026-10-14",
      age_confirmed: true,
      accepted_at: serverTimestamp()
    });
  });

  await runCase("1. Alta válida", async context => {
    const admin = await createTestUser(context, "admin", "approved", { admin: true });
    const user = await createTestUser(context, "tipster-a");
    if (!admin.uid || !user.uid) throw new Error("Los usuarios de prueba no se crearon.");
    await setDoc(doc(collection(context.db, "picks")), validPick(user.uid));
  });

  await runCase("2. Suplantación de UID", async context => {
    const userA = await createTestUser(context, "user-a");
    const userB = await createTestUser(context, "user-b");
    await signInTestUser(context, userA);
    await expectDenied(
      () => setDoc(doc(collection(context.db, "picks")), validPick(userB.uid)),
      "Crear pronóstico de B desde A"
    );
    if (!userA.uid) throw new Error("El usuario A no se creó.");
  });

  await runCase("3. Cuenta no aprobada: crear, editar y borrar", async context => {
    const pending = await createTestUser(context, "pending-user", "pending");
    const fixture = await setupSeededPick(context, pending);
    await expectDenied(
      () => setDoc(doc(collection(context.db, "picks")), validPick(pending.uid)),
      "Crear pronóstico con perfil pendiente"
    );
    await expectDenied(
      () => updateDoc(doc(context.db, "picks", fixture.id), { event: "Intento de edición" }),
      "Editar pronóstico con perfil pendiente"
    );
    await expectDenied(
      () => deleteDoc(doc(context.db, "picks", fixture.id)),
      "Borrar pronóstico con perfil pendiente"
    );
  });

  const invalidSchemas = [
    ["deporte con mayúscula", { sport: "Fútbol" }],
    ["casa con mayúscula", { bookmaker: "Betano" }],
    ["análisis superior a 4000 caracteres", { analysis: "x".repeat(4001) }],
    ["cuota superior a 1000", { odds: 1000.01 }],
    ["confianza igual a 6", { confianza: 6 }],
    ["selección vacía", { selection: "" }],
    ["created_at antiguo", { created_at: new Date("2020-01-01T00:00:00.000Z") }]
  ];
  for (const [label, overrides] of invalidSchemas) {
    await runCase(`4. Esquema inválido: ${label}`, async context => {
      const user = await createTestUser(context, "schema-user");
      await expectDenied(
        () => setDoc(doc(collection(context.db, "picks")), validPick(user.uid, overrides)),
        `Alta con ${label}`
      );
    });
  }

  await runCase("5. Lectura pública: aprobado/anulado permitido, revocado denegado", async context => {
    const approved = await createTestUser(context, "public-approved");
    const revoked = await createTestUser(context, "public-revoked", "revoked");
    const approvedPick = await setupSeededPick(context, approved, "void");
    const revokedPick = await setupSeededPick(context, revoked);
    await signOut(context.auth);
    const approvedProfile = await getDoc(doc(context.db, "perfiles", approved.uid));
    const approvedSocialProfile = await getDoc(doc(context.db, "perfiles_social", approved.uid));
    const anulledPick = await getDoc(doc(context.db, "picks", approvedPick.id));
    if (!approvedProfile.exists() || !approvedSocialProfile.exists()
      || !anulledPick.exists() || anulledPick.data().status !== "void") {
      throw new Error("No se pudo leer el perfil básico/social aprobado y el pronóstico anulado en modo público.");
    }
    await expectDenied(
      () => getDoc(doc(context.db, "perfiles", revoked.uid)),
      "Leer perfil revocado sin sesión"
    );
    await expectDenied(
      () => getDoc(doc(context.db, "perfiles_social", revoked.uid)),
      "Leer perfil social revocado sin sesión"
    );
    await expectDenied(
      () => getDoc(doc(context.db, "picks", revokedPick.id)),
      "Leer pronóstico de perfil revocado sin sesión"
    );
  });

  await runCase("6. Borrado: propio permitido, ajeno denegado", async context => {
    const userA = await createTestUser(context, "delete-a");
    const userB = await createTestUser(context, "delete-b");
    const ownPick = await setupSeededPick(context, userA);
    const otherPick = await setupSeededPick(context, userB);
    await signInTestUser(context, userA);
    await deleteDoc(doc(context.db, "picks", ownPick.id));
    await expectDenied(
      () => deleteDoc(doc(context.db, "picks", otherPick.id)),
      "Borrar pronóstico de B desde A"
    );
  });

  await runCase("Bankroll: alta atómica, privacidad y edición del dueño", async context => {
    const owner = await createTestUser(context, "bankroll-owner");
    const other = await createTestUser(context, "bankroll-other");
    const admin = await createTestUser(context, "bankroll-admin", "approved", { admin: true });
    await signInTestUser(context, owner);
    const pickRef = doc(collection(context.db, "picks"));
    const privateRef = doc(pickRef, "private", "bankroll");
    await runTransaction(context.db, async transaction => {
      transaction.set(pickRef, validPick(owner.uid));
      transaction.set(privateRef, {
        stakeAmount: 12.34, stakeMinorUnits: 1234, currency: "PEN",
        created_at: serverTimestamp(), updated_at: serverTimestamp()
      });
    });
    const initial = await getDoc(privateRef);
    if (initial.data().stakeMinorUnits !== 1234) throw new Error("Importe privado incorrecto.");
    await updateDoc(privateRef, {
      stakeAmount: 20, stakeMinorUnits: 2000, currency: "USD", updated_at: serverTimestamp()
    });
    for (const user of [other, admin]) {
      await signInTestUser(context, user);
      await expectDenied(() => getDoc(privateRef), "Leer bankroll ajeno");
      await expectDenied(() => updateDoc(privateRef, { stakeAmount: 99 }), "Editar bankroll ajeno");
      await expectDenied(() => deleteDoc(privateRef), "Borrar bankroll ajeno");
    }
    await signOut(context.auth);
    await getDoc(pickRef);
    await expectDenied(() => getDoc(privateRef), "Lectura anónima del bankroll");
    await signInTestUser(context, owner);
    const publicPick = await getDoc(pickRef);
    if ("stakeAmount" in publicPick.data() || "currency" in publicPick.data()) {
      throw new Error("Datos financieros filtrados al pick público.");
    }
    await expectDenied(() => deleteDoc(pickRef), "Borrar padre dejando bankroll huérfano");
    await runTransaction(context.db, async transaction => {
      transaction.delete(privateRef);
      transaction.delete(pickRef);
    });
    const deleted = await fetch(`${FIRESTORE_REST_ROOT}/picks/${pickRef.id}`, {
      headers: { authorization: "Bearer owner" }
    });
    if (deleted.status !== 404) throw new Error("No se eliminó el pick.");
  });

  await runCase("Bankroll: validación y rollback de creación", async context => {
    const owner = await createTestUser(context, "bankroll-invalid");
    const invalidData = [
      { stakeAmount: 0, stakeMinorUnits: 0, currency: "PEN" },
      { stakeAmount: -1, stakeMinorUnits: -100, currency: "PEN" },
      { stakeAmount: 1.234, stakeMinorUnits: 123, currency: "USD" },
      { stakeAmount: 1, stakeMinorUnits: 100, currency: "XXX" },
      { stakeAmount: 1000000001, stakeMinorUnits: 100000000100, currency: "EUR" },
      { stakeAmount: 1, stakeMinorUnits: 100, currency: "EUR", extra: "no permitido" }
    ];
    for (const data of invalidData) {
      const pickRef = doc(collection(context.db, "picks"));
      const privateRef = doc(pickRef, "private", "bankroll");
      await expectDenied(() => runTransaction(context.db, async transaction => {
        transaction.set(pickRef, validPick(owner.uid));
        transaction.set(privateRef, {
          ...data, created_at: serverTimestamp(), updated_at: serverTimestamp()
        });
      }), "Alta inválida de bankroll revierte el pick");
      for (const path of [`picks/${pickRef.id}`, `picks/${pickRef.id}/private/bankroll`]) {
        const response = await fetch(`${FIRESTORE_REST_ROOT}/${path}`, {
          headers: { authorization: "Bearer owner" }
        });
        if (response.status !== 404) throw new Error("La transacción dejó documentos parciales.");
      }
    }
    const orphanRef = doc(context.db, "picks", "missing-parent", "private", "bankroll");
    await expectDenied(() => setDoc(orphanRef, {
      stakeAmount: 1, stakeMinorUnits: 100, currency: "EUR",
      created_at: serverTimestamp(), updated_at: serverTimestamp()
    }), "Crear bankroll sin padre");
    await expectDenied(() => setDoc(doc(collection(context.db, "picks")), validPick(owner.uid, {
      stakeAmount: 10, currency: "PEN"
    })), "Guardar importe financiero en pick público");
  });

  await runCase("Bankroll: rollback si falla el pick público y compatibilidad sin importe", async context => {
    const owner = await createTestUser(context, "bankroll-public-invalid");
    const pickRef = doc(collection(context.db, "picks"));
    const privateRef = doc(pickRef, "private", "bankroll");
    await expectDenied(() => runTransaction(context.db, async transaction => {
      transaction.set(pickRef, validPick(owner.uid, { odds: 0 }));
      transaction.set(privateRef, {
        stakeAmount: 10, stakeMinorUnits: 1000, currency: "EUR",
        created_at: serverTimestamp(), updated_at: serverTimestamp()
      });
    }), "Pick inválido revierte el bankroll");
    await setDoc(pickRef, validPick(owner.uid));
    if ((await getDoc(privateRef)).exists()) throw new Error("Bankroll parcial después de rollback.");
    await setDoc(privateRef, {
      stakeAmount: 10, stakeMinorUnits: 1000, currency: "EUR",
      created_at: serverTimestamp(), updated_at: serverTimestamp()
    });
    await deleteDoc(privateRef);
    await updateDoc(pickRef, { status: "won" });
  });

  await runCase("Cash out: estado público y retorno privado coherentes y atómicos", async context => {
    const owner = await createTestUser(context, "cashout-owner");
    const pickRef = doc(collection(context.db, "picks"));
    const financialRef = doc(pickRef, "private", "bankroll");
    const stake = { stakeAmount: 100, stakeMinorUnits: 10000, currency: "PEN", created_at: serverTimestamp(), updated_at: serverTimestamp() };
    await runTransaction(context.db, async transaction => {
      transaction.set(pickRef, validPick(owner.uid));
      transaction.set(financialRef, stake);
    });
    await expectDenied(() => updateDoc(pickRef, {
      status: "cashed_out", cashout_odds: 1.05
    }), "Cierre sin retorno privado");
    await expectDenied(() => updateDoc(financialRef, {
      returnAmount: 105, returnMinorUnits: 10500, updated_at: serverTimestamp()
    }), "Retorno sin cierre público");
    for (const returned of [-100, 10500.5, 100000000001]) {
      await expectDenied(() => runTransaction(context.db, async transaction => {
        transaction.update(pickRef, { status: "cashed_out", cashout_odds: 1.05 });
        transaction.update(financialRef, { returnAmount: returned / 100, returnMinorUnits: returned, updated_at: serverTimestamp() });
      }), "Retorno inválido revierte el estado");
      if ((await getDoc(pickRef)).data().status !== "pending") throw new Error("Estado parcial tras rollback.");
    }
    for (const returned of [10500, 8000, 0]) {
      const candidatePickRef = returned === 10500 ? pickRef : doc(collection(context.db, "picks"));
      const candidateFinancialRef = doc(candidatePickRef, "private", "bankroll");
      if (candidatePickRef !== pickRef) {
        await runTransaction(context.db, async transaction => {
          transaction.set(candidatePickRef, validPick(owner.uid));
          transaction.set(candidateFinancialRef, stake);
        });
      }
      await runTransaction(context.db, async transaction => {
        transaction.update(candidatePickRef, { status: "cashed_out", cashout_odds: 1.05 });
        transaction.update(candidateFinancialRef, {
          returnAmount: returned / 100,
          returnMinorUnits: returned,
          updated_at: serverTimestamp()
        });
      });
      if ((await getDoc(candidateFinancialRef)).data().returnMinorUnits !== returned) {
        throw new Error("Retorno incorrecto.");
      }
    }
    await expectDenied(() => deleteDoc(financialRef), "Eliminar retorno dejando cierre público");
    await expectDenied(() => updateDoc(pickRef, {
      status: "won", cashout_odds: deleteField()
    }), "Cambiar resultado dejando retorno de cash out");
    await signOut(context.auth);
    const publicPick = await getDoc(pickRef);
    if (publicPick.data().status !== "cashed_out" || "returnAmount" in publicPick.data()) throw new Error("Cierre público incorrecto.");
    await expectDenied(() => getDoc(financialRef), "Leer retorno de cash out sin sesión");
    await signInTestUser(context, owner);
    await expectDenied(() => runTransaction(context.db, async transaction => {
      const financial = await transaction.get(financialRef);
      const { returnAmount, returnMinorUnits, ...original } = financial.data();
      transaction.update(pickRef, { status: "void", cashout_odds: deleteField() });
      transaction.set(financialRef, { ...original, updated_at: serverTimestamp() });
    }), "Reabrir el pronóstico y quitar su retorno de cash out");
    const closedFinancial = (await getDoc(financialRef)).data();
    if (!("returnAmount" in closedFinancial) || !("returnMinorUnits" in closedFinancial)) {
      throw new Error("El retorno cambió tras denegar la reapertura.");
    }
  });

  await runCase("7a. URL social http:// denegada por la regla HTTPS", async context => {
    const user = await createTestUser(context, "url-user");
    await signInTestUser(context, user);
    await expectDenied(
      () => submitProfileRequest(context, user, { kick_url: "http://example.com/channel" }),
      "Enviar solicitud con URL social http",
      true
    );
  });

  await runCase("7b. URL social javascript: denegada por la regla HTTPS", async context => {
    const user = await createTestUser(context, "javascript-url-user");
    await signInTestUser(context, user);
    await expectDenied(
      () => submitProfileRequest(context, user, { kick_url: "javascript:alert(1)" }),
      "Enviar solicitud con URL social javascript",
      true
    );
  });

  await runCase("8. created_at falsificado durante edición", async context => {
    const user = await createTestUser(context, "timestamp-user");
    const pick = await setupSeededPick(context, user);
    await expectDenied(
      () => updateDoc(doc(context.db, "picks", pick.id), {
        created_at: Timestamp.fromDate(new Date("2020-01-01T00:00:00.000Z"))
      }),
      "Editar created_at de pronóstico propio"
    );
  });

  await runCase("9. Usuario no puede cambiar su tipster_status", async context => {
    const user = await createTestUser(context, "status-user");
    await seedDocument(`perfiles/${user.uid}`, { tipster_status: "approved" });
    await expectDenied(
      () => updateDoc(doc(context.db, "perfiles", user.uid), { tipster_status: "revoked" }),
      "Cambiar tipster_status desde el perfil propio",
      true
    );
  });

  await runCase("9a. Admin puede revocar un perfil aprobado", async context => {
    const admin = await createTestUser(context, "status-admin", "approved", { admin: true });
    const tipster = await createTestUser(context, "status-tipster");
    await signInTestUser(context, admin);
    const profileRef = doc(context.db, "perfiles", tipster.uid);
    const metricsRef = doc(context.db, "perfiles_metricas", tipster.uid);
    const legacyProfile = profileDocument(tipster.uid, "approved", "status-tipster");
    legacyProfile.followerCount = 2;
    await seedDocument(`perfiles/${tipster.uid}`, legacyProfile);
    await runTransaction(context.db, async transaction => {
      const [profile, metrics] = await Promise.all([
        transaction.get(profileRef), transaction.get(metricsRef)
      ]);
      if (!profile.exists() || metrics.exists()) throw new Error("Estado inicial de revocación inválido.");
      transaction.update(profileRef, { tipster_status: "revoked" });
      transaction.set(metricsRef, { followerCount: profile.data().followerCount });
    });
    const [profile, metrics] = await Promise.all([getDoc(profileRef), getDoc(metricsRef)]);
    if (profile.data().tipster_status !== "revoked" || metrics.data().followerCount !== 2) {
      throw new Error("La revocación no preservó el contador histórico.");
    }
  });

  await runCase("9b. Admin puede inicializar métrica de perfil revocado legado", async context => {
    const admin = await createTestUser(context, "legacy-metric-admin", "approved", { admin: true });
    const tipster = await createTestUser(context, "legacy-revoked-tipster", "revoked");
    const legacyProfile = profileDocument(tipster.uid, "revoked", "legacy-revoked-tipster");
    legacyProfile.followerCount = 3;
    await seedDocument(`perfiles/${tipster.uid}`, legacyProfile);
    await signInTestUser(context, admin);
    const profileRef = doc(context.db, "perfiles", tipster.uid);
    const metricsRef = doc(context.db, "perfiles_metricas", tipster.uid);
    await runTransaction(context.db, async transaction => {
      const [profile, metrics] = await Promise.all([
        transaction.get(profileRef), transaction.get(metricsRef)
      ]);
      if (!profile.exists() || metrics.exists() || profile.data().tipster_status !== "revoked") {
        throw new Error("El estado inicial de la métrica revocada no es válido.");
      }
      transaction.set(metricsRef, { followerCount: profile.data().followerCount });
    });
    if ((await getDoc(metricsRef)).data().followerCount !== 3) {
      throw new Error("La inicialización no preservó el contador legado.");
    }
  });

  await runCase("10. Tipster no puede editar directamente perfiles_social", async context => {
    const user = await createTestUser(context, "social-owner");
    await expectDenied(
      () => updateDoc(doc(context.db, "perfiles_social", user.uid), {
        kick_url: "https://kick.com/social-owner"
      }),
      "Editar perfil social directamente",
      true
    );
  });

  await runCase("11. Tipster no puede escribir perfiles_social de otro", async context => {
    const userA = await createTestUser(context, "social-a");
    const userB = await createTestUser(context, "social-b");
    await signInTestUser(context, userA);
    await expectDenied(
      () => updateDoc(doc(context.db, "perfiles_social", userB.uid), {
        kick_url: "https://kick.com/attacker"
      }),
      "Editar perfil social de B desde A",
      true
    );
  });

  await runCase("11a. Seguir actualiza el contador dentro de la transacción", async context => {
    const follower = await createTestUser(context, "follower");
    const tipster = await createTestUser(context, "followed-tipster");
    const legacyProfile = profileDocument(tipster.uid, "approved", "followed-tipster");
    legacyProfile.followerCount = 2;
    await seedDocument(`perfiles/${tipster.uid}`, legacyProfile);
    await seedDocument(`users/${follower.uid}`, {
      uid: follower.uid,
      role: "viewer",
      displayName: "Follower",
      photoURL: null,
      email: follower.email,
      created_at: new Date("2026-10-04T12:00:00.000Z")
    });
    await signInTestUser(context, follower);
    const followRef = doc(context.db, "follows", `${follower.uid}_${tipster.uid}`);
    const profileRef = doc(context.db, "perfiles", tipster.uid);
    const metricsRef = doc(context.db, "perfiles_metricas", tipster.uid);
    await runTransaction(context.db, async transaction => {
      const [follow, profile, metrics] = await Promise.all([
        transaction.get(followRef),
        transaction.get(profileRef),
        transaction.get(metricsRef)
      ]);
      if (follow.exists() || !profile.exists() || metrics.exists()) {
        throw new Error("El estado inicial del follow no es válido.");
      }
      const count = profile.data().followerCount ?? 0;
      transaction.set(followRef, {
        followerId: follower.uid,
        tipsterId: tipster.uid,
        created_at: serverTimestamp()
      });
      transaction.set(metricsRef, { followerCount: count + 1 });
    });
    const [profileAfterFollow, metricsAfterFollow] = await Promise.all([
      getDoc(profileRef),
      getDoc(metricsRef)
    ]);
    if (profileAfterFollow.data().followerCount !== 2
      || metricsAfterFollow.data().followerCount !== 3) {
      throw new Error("El follow no preservó el contador histórico ni lo incrementó.");
    }
    await runTransaction(context.db, async transaction => {
      const [follow, metrics] = await Promise.all([
        transaction.get(followRef),
        transaction.get(metricsRef)
      ]);
      if (!follow.exists() || !metrics.exists()) {
        throw new Error("El estado inicial del unfollow no es válido.");
      }
      transaction.delete(followRef);
      transaction.update(metricsRef, { followerCount: metrics.data().followerCount - 1 });
    });
    const [profileAfterUnfollow, metricsAfterUnfollow, removedFollow] = await Promise.all([
      getDoc(profileRef),
      getDoc(metricsRef),
      getDoc(followRef)
    ]);
    if (profileAfterUnfollow.data().followerCount !== 2
      || metricsAfterUnfollow.data().followerCount !== 2
      || removedFollow.exists()) {
      throw new Error("El unfollow no restauró el contador.");
    }
  });

  await runCase("11b. No se puede alterar el contador sin cambiar un follow", async context => {
    const user = await createTestUser(context, "metrics-counter-user");
    const tipster = await createTestUser(context, "metrics-counter-tipster");
    await signInTestUser(context, user);
    await expectDenied(
      () => setDoc(doc(context.db, "perfiles_metricas", tipster.uid), { followerCount: 1 }),
      "Crear el contador sin crear el follow correspondiente"
    );
    await seedDocument(`perfiles_metricas/${tipster.uid}`, { followerCount: 0 });
    await expectDenied(
      () => updateDoc(doc(context.db, "perfiles_metricas", tipster.uid), { followerCount: 500 }),
      "Alterar el contador sin crear o borrar el follow correspondiente"
    );
  });

  await runCase("11c. Unfollow legado inicializa la métrica separada", async context => {
    const follower = await createTestUser(context, "legacy-unfollow-follower");
    const tipster = await createTestUser(context, "legacy-unfollow-tipster");
    const legacyProfile = profileDocument(tipster.uid, "approved", "legacy-unfollow-tipster");
    legacyProfile.followerCount = 2;
    await seedDocument(`perfiles/${tipster.uid}`, legacyProfile);
    const followRef = doc(context.db, "follows", `${follower.uid}_${tipster.uid}`);
    await seedDocument(followRef.path, {
      followerId: follower.uid,
      tipsterId: tipster.uid,
      created_at: new Date("2026-10-04T12:00:00.000Z")
    });
    await signInTestUser(context, follower);
    const profileRef = doc(context.db, "perfiles", tipster.uid);
    const metricsRef = doc(context.db, "perfiles_metricas", tipster.uid);
    await runTransaction(context.db, async transaction => {
      const [follow, profile, metrics] = await Promise.all([
        transaction.get(followRef), transaction.get(profileRef), transaction.get(metricsRef)
      ]);
      if (!follow.exists() || !profile.exists() || metrics.exists()) {
        throw new Error("El estado inicial del unfollow legado no es válido.");
      }
      transaction.delete(followRef);
      transaction.set(metricsRef, { followerCount: profile.data().followerCount - 1 });
    });
    const [follow, metrics] = await Promise.all([getDoc(followRef), getDoc(metricsRef)]);
    if (follow.exists() || metrics.data().followerCount !== 1) {
      throw new Error("El unfollow legado no migró y decrementó el contador.");
    }
  });

  await runCase("11d. Viewer puede dejar de seguir un tipster revocado", async context => {
    const follower = await createTestUser(context, "revoked-unfollow-follower");
    const tipster = await createTestUser(context, "revoked-unfollow-tipster");
    await seedDocument(`perfiles/${tipster.uid}`, profileDocument(tipster.uid, "revoked", "revoked-unfollow-tipster"));
    await seedDocument(`perfiles_metricas/${tipster.uid}`, { followerCount: 1 });
    const followRef = doc(context.db, "follows", `${follower.uid}_${tipster.uid}`);
    await seedDocument(followRef.path, {
      followerId: follower.uid,
      tipsterId: tipster.uid,
      created_at: new Date("2026-10-04T12:00:00.000Z")
    });
    await signInTestUser(context, follower);
    await expectDenied(
      () => getDoc(doc(context.db, "perfiles", tipster.uid)),
      "Leer el perfil revocado desde otro usuario"
    );
    const metricsRef = doc(context.db, "perfiles_metricas", tipster.uid);
    if (!(await getDoc(followRef)).exists()) throw new Error("El follow de la fixture no es legible por su dueño.");
    const metricSnapshot = await getDoc(metricsRef);
    if (!metricSnapshot.exists()) throw new Error("La métrica del perfil revocado no existe.");
    await runTransaction(context.db, async transaction => {
      const [follow, metrics] = await Promise.all([
        transaction.get(followRef), transaction.get(metricsRef)
      ]);
      if (!follow.exists() || !metrics.exists()) throw new Error("El estado inicial del unfollow revocado no es válido.");
      transaction.delete(followRef);
      transaction.update(metricsRef, { followerCount: metrics.data().followerCount - 1 });
    });
    if ((await getDoc(followRef)).exists()) {
      throw new Error("El viewer no pudo eliminar el follow del perfil revocado.");
    }
    await signInTestUser(context, tipster);
    const metrics = await getDoc(metricsRef);
    if (metrics.data().followerCount !== 0) {
      throw new Error("El viewer no pudo eliminar el follow del perfil revocado.");
    }
  });

  await runCase("11e. Viewer no puede sondear follows ausentes de terceros", async context => {
    const viewer = await createTestUser(context, "follow-probe-viewer");
    const other = await createTestUser(context, "follow-probe-other");
    await signInTestUser(context, viewer);
    const ownMissingFollow = await getDoc(doc(context.db, "follows", `${viewer.uid}_${other.uid}`));
    if (ownMissingFollow.exists()) throw new Error("La relación propia debería estar ausente.");
    await expectDenied(
      () => getDoc(doc(context.db, "follows", `${other.uid}_${viewer.uid}`)),
      "Consultar una relación inexistente de otro usuario",
      true
    );
  });

  await runCase("11f. Backfill admin permite unfollow histórico revocado", async context => {
    const follower = await createTestUser(context, "revoked-legacy-follower");
    const tipster = await createTestUser(context, "revoked-legacy-tipster", "revoked");
    const admin = await createTestUser(context, "revoked-legacy-admin", "approved", { admin: true });
    const legacyProfile = profileDocument(tipster.uid, "revoked", "revoked-legacy-tipster");
    legacyProfile.followerCount = 1;
    await seedDocument(`perfiles/${tipster.uid}`, legacyProfile);
    const followRef = doc(context.db, "follows", `${follower.uid}_${tipster.uid}`);
    const profileRef = doc(context.db, "perfiles", tipster.uid);
    const metricsRef = doc(context.db, "perfiles_metricas", tipster.uid);
    await seedDocument(followRef.path, {
      followerId: follower.uid,
      tipsterId: tipster.uid,
      created_at: new Date("2026-10-04T12:00:00.000Z")
    });

    await signInTestUser(context, admin);
    await runTransaction(context.db, async transaction => {
      const [profile, metrics] = await Promise.all([
        transaction.get(profileRef), transaction.get(metricsRef)
      ]);
      if (!profile.exists() || metrics.exists() || profile.data().tipster_status !== "revoked") {
        throw new Error("El estado inicial del backfill revocado no es válido.");
      }
      transaction.set(metricsRef, { followerCount: profile.data().followerCount });
    });

    await signInTestUser(context, follower);
    await runTransaction(context.db, async transaction => {
      const [follow, metrics] = await Promise.all([
        transaction.get(followRef), transaction.get(metricsRef)
      ]);
      if (!follow.exists() || !metrics.exists()) {
        throw new Error("El backfill no habilitó la lectura de la relación y su métrica.");
      }
      transaction.delete(followRef);
      transaction.update(metricsRef, { followerCount: metrics.data().followerCount - 1 });
    });
    if ((await getDoc(followRef)).exists()) {
      throw new Error("El viewer no pudo dejar de seguir tras el backfill administrativo.");
    }

    await signInTestUser(context, tipster);
    const metrics = await getDoc(metricsRef);
    if (metrics.data().followerCount !== 0) {
      throw new Error("El viewer no pudo dejar de seguir tras el backfill administrativo.");
    }
  });

  await runCase("12. Tipster crea una solicitud válida con reserva pendiente", async context => {
    const user = await createTestUser(context, "profile-request-create");
    await signInTestUser(context, user);
    const request = await submitProfileRequest(context, user, { bio: "Nuevo resumen público" });
    const savedRequest = await getDoc(request.requestRef);
    const reservation = await getDoc(request.reservationRef);
    if (!savedRequest.exists() || savedRequest.data().estado !== "pendiente"
      || savedRequest.data().cambios.bio !== "Nuevo resumen público"
      || reservation.data().solicitud_id !== request.id) {
      throw new Error("La solicitud o su reserva pendiente no se guardaron correctamente.");
    }
  });

  await runCase("13. Tipster no puede crear una segunda solicitud pendiente", async context => {
    const user = await createTestUser(context, "profile-request-duplicate");
    await signInTestUser(context, user);
    await submitProfileRequest(context, user, { bio: "Primera propuesta" });
    const duplicateId = `profile-request-duplicate-${randomUUID()}`;
    const duplicateRef = doc(context.db, "perfilSolicitudes", duplicateId);
    const reservationRef = doc(context.db, "perfilSolicitudesPendientes", user.uid);
    await expectDenied(
      () => runTransaction(context.db, async transaction => {
        const createdAt = serverTimestamp();
        transaction.set(duplicateRef, {
          uid: user.uid,
          cambios: { nombre_publico: "Segunda propuesta" },
          estado: "pendiente",
          motivoRechazo: null,
          created_at: createdAt,
          revisado_at: null,
          revisado_por: null
        });
        transaction.set(reservationRef, {
          uid: user.uid,
          solicitud_id: duplicateId,
          created_at: createdAt
        });
      }),
      "Crear segunda solicitud pendiente"
    );
  });

  await runCase("14. Admin aprueba cambios y libera la reserva", async context => {
    const admin = await createTestUser(context, "profile-request-admin", "approved", { admin: true });
    const user = await createTestUser(context, "profile-request-approved");
    await signInTestUser(context, user);
    const request = await submitProfileRequest(context, user, { bio: "Descripción aprobada" });
    await signInTestUser(context, admin);
    const profileRef = doc(context.db, "perfiles", user.uid);
    await runTransaction(context.db, async transaction => {
      const [requestSnapshot, reservationSnapshot, profileSnapshot] = await Promise.all([
        transaction.get(request.requestRef),
        transaction.get(request.reservationRef),
        transaction.get(profileRef)
      ]);
      if (!requestSnapshot.exists() || !reservationSnapshot.exists() || !profileSnapshot.exists()) {
        throw new Error("Faltan documentos de la solicitud para aprobar.");
      }
      transaction.update(profileRef, { bio: "Descripción aprobada" });
      transaction.update(request.requestRef, {
        estado: "aprobada",
        motivoRechazo: null,
        revisado_at: serverTimestamp(),
        revisado_por: admin.uid
      });
      transaction.delete(request.reservationRef);
    });
    const [savedRequest, savedProfile, reservation] = await Promise.all([
      getDoc(request.requestRef),
      getDoc(profileRef),
      getDoc(request.reservationRef)
    ]);
    if (savedRequest.data().estado !== "aprobada" || savedProfile.data().bio !== "Descripción aprobada" || reservation.exists()) {
      throw new Error("La aprobación no aplicó el cambio o no liberó la reserva.");
    }
  });

  await runCase("14a. Admin aprueba cambios de perfil social", async context => {
    const admin = await createTestUser(context, "social-request-admin", "approved", { admin: true });
    const user = await createTestUser(context, "social-request-user");
    await signInTestUser(context, user);
    const request = await submitProfileRequest(context, user, {
      kick_url: "https://kick.com/approved-channel"
    });
    await signInTestUser(context, admin);
    const socialRef = doc(context.db, "perfiles_social", user.uid);
    await runTransaction(context.db, async transaction => {
      const social = await transaction.get(socialRef);
      if (!social.exists()) throw new Error("Falta el perfil social.");
      transaction.update(socialRef, { kick_url: "https://kick.com/approved-channel" });
      transaction.update(request.requestRef, {
        estado: "aprobada",
        motivoRechazo: null,
        revisado_at: serverTimestamp(),
        revisado_por: admin.uid
      });
      transaction.delete(request.reservationRef);
    });
    const [savedSocial, savedRequest, reservation] = await Promise.all([
      getDoc(socialRef),
      getDoc(request.requestRef),
      getDoc(request.reservationRef)
    ]);
    if (savedSocial.data().kick_url !== "https://kick.com/approved-channel"
      || savedRequest.data().estado !== "aprobada"
      || reservation.exists()) {
      throw new Error("La aprobación social no se aplicó o no liberó la reserva.");
    }
  });

  await runCase("15. Admin rechaza con motivo y libera la reserva", async context => {
    const admin = await createTestUser(context, "profile-request-reject-admin", "approved", { admin: true });
    const user = await createTestUser(context, "profile-request-reject");
    await signInTestUser(context, user);
    const request = await submitProfileRequest(context, user, { bio: "Texto por corregir" });
    await signInTestUser(context, admin);
    await runTransaction(context.db, async transaction => {
      const [requestSnapshot, reservationSnapshot] = await Promise.all([
        transaction.get(request.requestRef),
        transaction.get(request.reservationRef)
      ]);
      if (!requestSnapshot.exists() || !reservationSnapshot.exists()) {
        throw new Error("Faltan documentos de la solicitud para rechazar.");
      }
      transaction.update(request.requestRef, {
        estado: "rechazada",
        motivoRechazo: "Aclara la descripción.",
        revisado_at: serverTimestamp(),
        revisado_por: admin.uid
      });
      transaction.delete(request.reservationRef);
    });
    const [savedRequest, reservation] = await Promise.all([
      getDoc(request.requestRef),
      getDoc(request.reservationRef)
    ]);
    if (savedRequest.data().estado !== "rechazada"
      || savedRequest.data().motivoRechazo !== "Aclara la descripción."
      || reservation.exists()) {
      throw new Error("El rechazo no guardó el motivo o no liberó la reserva.");
    }
  });

  await runCase("16. Tipster no puede leer solicitudes de otro", async context => {
    const userA = await createTestUser(context, "profile-request-reader-a");
    const userB = await createTestUser(context, "profile-request-reader-b");
    const requestId = `private-profile-request-${randomUUID()}`;
    const cambios = {};
    cambios["bio"] = "Privado";
    await seedDocument(`perfilSolicitudes/${requestId}`, {
      uid: userB.uid,
      cambios: cambios,
      estado: "pendiente",
      motivoRechazo: null,
      created_at: new Date("2026-10-04T12:00:00.000Z"),
      revisado_at: null,
      revisado_por: null
    });
    await signInTestUser(context, userA);
    await expectDenied(
      () => getDoc(doc(context.db, "perfilSolicitudes", requestId)),
      "Leer la solicitud de B desde A"
    );
  });

  await runCase("17. Tipster no puede actualizar ni borrar su solicitud", async context => {
    const user = await createTestUser(context, "profile-request-owner");
    await signInTestUser(context, user);
    const request = await submitProfileRequest(context, user, { bio: "Propuesta propia" });
    await expectDenied(
      () => updateDoc(request.requestRef, { estado: "aprobada" }),
      "Actualizar la solicitud propia"
    );
    await expectDenied(
      () => deleteDoc(request.requestRef),
      "Borrar la solicitud propia"
    );
  });

  await runCase("18. Admin aprueba y crea perfil básico y social coordinadamente", async context => {
    const admin = await createTestUser(context, "approval-admin", "approved", { admin: true });
    const applicant = await createTestUser(context, "approval-applicant", "pending");
    const applicationRef = doc(context.db, "tipsterApplications", applicant.uid);
    await seedDocument(`tipsterApplications/${applicant.uid}`, {
      uid: applicant.uid,
      display_name: "Aprobación de prueba",
      email: applicant.email,
      requested_username: "new-approval",
      status: "pending",
      submitted_at: new Date("2026-10-04T12:00:00.000Z"),
      reviewed_at: null,
      reviewed_by: null
    });
    await signInTestUser(context, admin);
    const profileRef = doc(context.db, "perfiles", applicant.uid);
    const socialRef = doc(context.db, "perfiles_social", applicant.uid);
    const usernameRef = doc(context.db, "usernames", "new-approval");
    await runTransaction(context.db, async transaction => {
      const [application, profile, social, username] = await Promise.all([
        transaction.get(applicationRef),
        transaction.get(profileRef),
        transaction.get(socialRef),
        transaction.get(usernameRef)
      ]);
      if (!application.exists() || username.exists()) throw new Error("Fixtures de aprobación inválidos.");
      const basic = profileDocument(applicant.uid, "approved", "new-approval");
      basic.nombre_publico = "Aprobación de prueba";
      basic.created_at = profile.exists() ? profile.data().created_at : serverTimestamp();
      transaction.set(profileRef, basic);
      transaction.set(socialRef, socialProfileDocument());
      transaction.set(usernameRef, { uid: applicant.uid });
      transaction.update(applicationRef, {
        status: "approved",
        reviewed_at: serverTimestamp(),
        reviewed_by: admin.uid
      });
    });
    const [profile, social] = await Promise.all([getDoc(profileRef), getDoc(socialRef)]);
    if (!profile.exists() || profile.data().tipster_status !== "approved" || !social.exists()) {
      throw new Error("La aprobación no creó ambos documentos.");
    }
  });

  await clearEmulatorData();
  const passed = CASES.filter(testCase => testCase.passed).length;
  const failed = CASES.length - passed;
  console.log(`\nResumen: ${passed} pasaron, ${failed} fallaron.`);
  if (failed) process.exitCode = 1;
}

main().catch(error => {
  console.error(`[FALLO] Inicio del script — ${formatError(error)}`);
  console.log(`\nResumen: 0 pasaron, 1 fallaron.`);
  process.exitCode = 1;
});
