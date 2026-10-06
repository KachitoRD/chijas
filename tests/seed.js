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
  connectAuthEmulator
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  Timestamp
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

// ─────────────────────────────────────────────────────────────────────
// Helpers copiados de tests/rules.test.js
// (No se importan porque rules.test.js no exporta nada)
// ─────────────────────────────────────────────────────────────────────

// Copiado de tests/rules.test.js
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

// Copiado de tests/rules.test.js
function documentFields(data) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, valueToRest(value)]));
}

// Copiado de tests/rules.test.js
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

// Copiado de tests/rules.test.js
async function emulatorRequest(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${body}`);
  }
  return body ? JSON.parse(body) : null;
}

// Limpiar datos previos del emulador
async function clearEmulatorData() {
  try {
    await emulatorRequest(`${AUTH_EMULATOR_URL}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
      method: "DELETE"
    });
    await emulatorRequest(`${FIRESTORE_EMULATOR_URL}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, {
      method: "DELETE"
    });
  } catch (error) {
    console.warn("⚠️  No se pudieron limpiar los datos previos (puede ser normal):", error.message);
  }
}

// Copiado de tests/rules.test.js
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

// Copiado de tests/rules.test.js - adaptado para no necesitar signInTestUser
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

// Copiado de tests/rules.test.js
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

// Copiado de tests/rules.test.js
function acceptedTerms(uid) {
  return {
    uid,
    terms_version: "2026-10-03",
    privacy_version: "2026-10-03",
    age_confirmed: true,
    accepted_at: new Date("2026-10-04T12:00:00.000Z")
  };
}

// ─────────────────────────────────────────────────────────────────────
// Funciones principales del seed
// ─────────────────────────────────────────────────────────────────────

async function createTestUser(auth, email, username, status = "approved", options = {}) {
  const credential = await createUserWithEmailAndPassword(auth, email, TEST_PASSWORD);
  const user = credential.user;

  // En el emulador, no es necesario verificar el email
  // pero lo intentamos si está disponible
  try {
    await sendEmailVerification(user);
    const { oobCodes } = await emulatorRequest(`${AUTH_EMULATOR_URL}/emulator/v1/projects/${PROJECT_ID}/oobCodes`);
    const verificationCode = oobCodes.find(code => code.email === email && code.requestType === "VERIFY_EMAIL")?.oobCode;
    if (verificationCode) {
      await emulatorRequest(AUTH_UPDATE_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ oobCode: verificationCode })
      });
      await reload(user);
    }
  } catch (error) {
    console.log(`  ⚠️  Email verification skipped for ${email}: ${error.message}`);
  }

  // Crear documentos en Firestore
  await seedDocument(`perfiles/${user.uid}`, profileDocument(user.uid, status, username));
  await seedDocument(`perfiles_social/${user.uid}`, socialProfileDocument());
  await seedDocument(`usernames/${username}`, { uid: user.uid });
  await seedDocument(`legalAcceptances/${user.uid}/versions/2026-10-03`, acceptedTerms(user.uid));

  if (options.admin) {
    await seedDocument(`platformAdmins/${user.uid}`, { enabled: true });
  }

  return user;
}

async function main() {
  if (PROJECT_ID !== "demo-fijas-vivo" || !AUTH_EMULATOR_URL.startsWith("http://127.0.0.1:")
    || !FIRESTORE_EMULATOR_URL.startsWith("http://127.0.0.1:")) {
    throw new Error("Safety check: seed must target only the local demo project emulators.");
  }

  console.log("\n🔌 Verificando conexión a emuladores...");
  await assertEmulatorPort(AUTH_HOST, AUTH_PORT, "Auth");
  await assertEmulatorPort(FIRESTORE_HOST, FIRESTORE_PORT, "Firestore");

  console.log("🧹 Limpiando datos anteriores del emulador...");
  await clearEmulatorData();

  const app = initializeApp({
    apiKey: "demo-api-key",
    projectId: PROJECT_ID,
    authDomain: `${PROJECT_ID}.firebaseapp.com`,
    appId: `1:${PROJECT_ID}:web:${randomUUID()}`
  }, `seed-${randomUUID()}`);

  const auth = getAuth(app);
  connectAuthEmulator(auth, AUTH_EMULATOR_URL, { disableWarnings: true });

  const db = getFirestore(app);
  connectFirestoreEmulator(db, FIRESTORE_HOST, FIRESTORE_PORT);

  console.log("\n📊 Cargando datos de prueba...\n");

  try {
    // Admin
    console.log("  ✓ Creando admin@test.local (platformAdmins)...");
    const admin = await createTestUser(auth, "admin@test.local", "admin", "approved", { admin: true });
    console.log(`    └─ UID: ${admin.uid}`);

    // Tipster aprobado
    console.log("  ✓ Creando tipster@test.local (aprobado)...");
    const tipster = await createTestUser(auth, "tipster@test.local", "tipster", "approved");
    console.log(`    └─ UID: ${tipster.uid}`);

    // Tipster pendiente
    console.log("  ✓ Creando pending@test.local (pendiente)...");
    const pending = await createTestUser(auth, "pending@test.local", "pending", "pending");
    console.log(`    └─ UID: ${pending.uid}`);

    // Crear tipsterApplications para pending
    console.log("  ✓ Creando tipsterApplications/{uid} para pending...");
    await seedDocument(`tipsterApplications/${pending.uid}`, {
      uid: pending.uid,
      display_name: "Usuario pending",
      email: "pending@test.local",
      requested_username: "pending",
      status: "pending",
      submitted_at: new Date("2026-10-04T12:00:00.000Z"),
      reviewed_at: null,
      reviewed_by: null
    });
    console.log(`    └─ Solicitud creada en tipsterApplications/${pending.uid}`);

    console.log("\n✅ Datos de prueba cargados correctamente.\n");
    console.log("📝 Credenciales de prueba:");
    console.log("─────────────────────────────────────────────");
    console.log("  Admin:");
    console.log("    Email: admin@test.local");
    console.log(`    Contraseña: ${TEST_PASSWORD}`);
    console.log("    Rol: platformAdmins (uid en platformAdmins/{uid})");
    console.log("");
    console.log("  Tipster aprobado:");
    console.log("    Email: tipster@test.local");
    console.log(`    Contraseña: ${TEST_PASSWORD}`);
    console.log("    Estado: tipster_status = 'approved'");
    console.log("");
    console.log("  Tipster pendiente:");
    console.log("    Email: pending@test.local");
    console.log(`    Contraseña: ${TEST_PASSWORD}`);
    console.log("    Estado: tipster_status = 'pending'");
    console.log("    Solicitud: tipsterApplications/pending.uid (status = 'pending')");
    console.log("─────────────────────────────────────────────\n");
  } catch (error) {
    console.error("\n❌ Error al cargar datos de prueba:");
    console.error(error.message);
    process.exit(1);
  } finally {
    await deleteApp(app);
  }
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
