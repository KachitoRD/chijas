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
    terms_version: "2026-10-03",
    privacy_version: "2026-10-03",
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

  await seedDocument(`perfiles/${user.uid}`, profileDocument(user.uid, status, label));
  await seedDocument(`perfiles_social/${user.uid}`, socialProfileDocument());
  await seedDocument(`usernames/${label}`, { uid: user.uid });
  await seedDocument(`legalAcceptances/${user.uid}/versions/2026-10-03`, acceptedTerms(user.uid));
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
    deporte: "futbol",
    evento: "Alianza Lima vs Universitario",
    seleccion: "Más de 1.5 goles",
    prediccion: "Más de 1.5 goles",
    cuota: 1.85,
    casa_de_apuestas: "betano",
    casa_apuestas: "betano",
    fecha_evento: Timestamp.fromDate(new Date("2026-10-05T20:00:00.000Z")),
    confianza: 4,
    nota: null,
    destacada: false,
    show_on_stream: false,
    estado: "pendiente",
    created_at: serverTimestamp(),
    ...overrides
  };
}

async function seedPick(userId, status = "pendiente", overrides = {}) {
  const id = `pick-${randomUUID()}`;
  const data = {
    ...validPick(userId, {
      created_at: new Date("2026-10-04T12:00:00.000Z"),
      estado: status,
      ...overrides
    })
  };
  await seedDocument(`picks/${id}`, data);
  return { id, data };
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

async function setupSeededPick(context, user, status = "pendiente") {
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
      () => updateDoc(doc(context.db, "picks", fixture.id), { evento: "Intento de edición" }),
      "Editar pronóstico con perfil pendiente"
    );
    await expectDenied(
      () => deleteDoc(doc(context.db, "picks", fixture.id)),
      "Borrar pronóstico con perfil pendiente"
    );
  });

  const invalidSchemas = [
    ["deporte con mayúscula", { deporte: "Fútbol" }],
    ["casa con mayúscula", { casa_de_apuestas: "Betano", casa_apuestas: "Betano" }],
    ["nota de 501 caracteres", { nota: "x".repeat(501) }],
    ["cuota superior a 1000", { cuota: 1000.01 }],
    ["confianza igual a 6", { confianza: 6 }],
    ["seleccion distinta de prediccion", { prediccion: "Menos de 1.5 goles" }],
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
    const approvedPick = await setupSeededPick(context, approved, "anulada");
    const revokedPick = await setupSeededPick(context, revoked);
    await signOut(context.auth);
    const approvedProfile = await getDoc(doc(context.db, "perfiles", approved.uid));
    const approvedSocialProfile = await getDoc(doc(context.db, "perfiles_social", approved.uid));
    const anulledPick = await getDoc(doc(context.db, "picks", approvedPick.id));
    if (!approvedProfile.exists() || !approvedSocialProfile.exists()
      || !anulledPick.exists() || anulledPick.data().estado !== "anulada") {
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

  await runCase("7a. URL social http:// denegada por la regla HTTPS", async context => {
    const user = await createTestUser(context, "url-user");
    const profileRef = doc(context.db, "perfiles_social", user.uid);
    await updateDoc(profileRef, { kick_url: "https://example.com/channel" });
    await expectDenied(
      () => updateDoc(profileRef, { kick_url: "http://example.com/channel" }),
      "Guardar URL social http"
    );
  });

  await runCase("7b. URL social javascript: denegada por la regla HTTPS", async context => {
    const user = await createTestUser(context, "javascript-url-user");
    const profileRef = doc(context.db, "perfiles_social", user.uid);
    await updateDoc(profileRef, { kick_url: "https://example.com/channel" });
    await expectDenied(
      () => updateDoc(profileRef, { kick_url: "javascript:alert(1)" }),
      "Guardar URL social javascript"
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
    await updateDoc(doc(context.db, "perfiles", user.uid), { nombre_publico: "Nombre actualizado" });
    await expectDenied(
      () => updateDoc(doc(context.db, "perfiles", user.uid), { tipster_status: "revoked" }),
      "Cambiar tipster_status desde el perfil propio",
      true
    );
  });

  await runCase("10. Tipster actualiza sus propios campos sociales", async context => {
    const user = await createTestUser(context, "social-owner");
    await updateDoc(doc(context.db, "perfiles_social", user.uid), {
      kick_url: "https://kick.com/social-owner",
      avatar_url: "data:image/jpeg;base64,AA=="
    });
    const saved = await getDoc(doc(context.db, "perfiles_social", user.uid));
    if (saved.data().kick_url !== "https://kick.com/social-owner") {
      throw new Error("El cambio social del dueño no quedó guardado.");
    }
  });

  await runCase("11. Tipster no puede escribir perfiles_social de otro", async context => {
    const userA = await createTestUser(context, "social-a");
    const userB = await createTestUser(context, "social-b");
    await signInTestUser(context, userA);
    await expectDenied(
      () => updateDoc(doc(context.db, "perfiles_social", userB.uid), {
        kick_url: "https://kick.com/attacker"
      }),
      "Editar perfil social de B desde A"
    );
  });

  await runCase("12. Admin aprueba y crea perfil básico y social coordinadamente", async context => {
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
      basic.created_at = profile.data().created_at;
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
