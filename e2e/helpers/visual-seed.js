export const visualAccounts = {
  viewer: { email: "viewer_test@fijasenvivo.local", password: "Test123456!", name: "Viewer de Prueba" },
  tipster: { email: "tipster_test@fijasenvivo.local", password: "Test123456!", name: "Tipster de Prueba" },
  owner: { email: "owner_test@fijasenvivo.local", password: "Test123456!", name: "Owner de Prueba" }
};
export const visualUsername = "tipster_test";
export const firestoreRoot = "http://127.0.0.1:8080/v1/projects/demo-fijas-vivo/databases/(default)/documents";
const authRoot = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const headers = { Authorization: "Bearer owner" };

async function checked(response) {
  const body = await response.json();
  if (!response.ok()) throw new Error(`Seed emulator HTTP ${response.status()}: ${JSON.stringify(body)}`);
  return body;
}

export async function writeVisualDocument(request, path, data) {
  const fields = Object.fromEntries(Object.entries(data).map(([key, value]) => [key,
    value === null ? { nullValue: null }
      : value instanceof Date ? { timestampValue: value.toISOString() }
        : typeof value === "boolean" ? { booleanValue: value }
          : typeof value === "number" ? { integerValue: String(value) }
            : { stringValue: value }
  ]));
  const mask = Object.keys(fields).map(key => `updateMask.fieldPaths=${encodeURIComponent(key)}`).join("&");
  return checked(await request.patch(`${firestoreRoot}/${path}?${mask}`, { headers, data: { fields } }));
}

export async function deleteVisualDocument(request, path) {
  const response = await request.delete(`${firestoreRoot}/${path}`, { headers });
  if (!response.ok() && response.status() !== 404) await checked(response);
}

export async function findVisualPickIds(request, uid, event) {
  const rows = await checked(await request.post(`${firestoreRoot}:runQuery`, {
    headers, data: { structuredQuery: {
      from: [{ collectionId: "picks" }],
      where: { fieldFilter: { field: { fieldPath: "user_id" }, op: "EQUAL", value: { stringValue: uid } } }
    } }
  }));
  return rows.filter(row => row.document?.fields.event?.stringValue === event)
    .map(row => row.document.name.split("/").at(-1));
}

export async function includeVisualUpcomingPicks(page) {
  const range = await page.evaluate(() => [-1, 1].map(offset => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  }));
  if (!await page.locator("#bankrollPeriod").isVisible()) {
    await page.locator("#bankrollFilterPanel > summary").click();
  }
  await page.locator("#bankrollPeriod").selectOption("custom");
  await page.locator("#bankrollFrom").fill(range[0]);
  await page.locator("#bankrollThrough").fill(range[1]);
  await page.locator("#bankrollReload").click();
}

export async function seedVisualAccounts(request) {
  // Fixed loopback URLs and demo project prevent accidental production provisioning.
  const accounts = {};
  for (const [role, account] of Object.entries(visualAccounts)) {
    const lookup = await checked(await request.post(`${authRoot}/accounts:lookup?key=demo-key`, {
      headers, data: { email: [account.email] }
    }));
    let uid = lookup.users?.[0]?.localId;
    if (!uid) {
      const created = await checked(await request.post(`${authRoot}/accounts:signUp?key=demo-key`, {
        data: { email: account.email, password: account.password, returnSecureToken: true }
      }));
      uid = created.localId;
    }
    await checked(await request.post(`${authRoot}/accounts:update?key=demo-key`, {
      headers, data: { localId: uid, password: account.password, emailVerified: true, displayName: account.name }
    }));
    await checked(await request.post(`${authRoot}/accounts:signInWithPassword?key=demo-key`, {
      data: { email: account.email, password: account.password, returnSecureToken: true }
    }));
    accounts[role] = { ...account, uid };
    await writeVisualDocument(request, `users/${uid}`, {
      uid, role, displayName: account.name, photoURL: null, created_at: new Date()
    });
    await writeVisualDocument(request, `legalAcceptances/${uid}/versions/2026-10-03`, {
      uid, terms_version: "2026-10-03", privacy_version: "2026-10-03", age_confirmed: true, accepted_at: new Date()
    });
  }
  const uid = accounts.tipster.uid;
  const profile = await request.get(`${firestoreRoot}/perfiles/${uid}`, { headers });
  if (!profile.ok() && profile.status() !== 404) await checked(profile);
  await writeVisualDocument(request, `perfiles/${uid}`, {
    id: uid, username: visualUsername, nombre_publico: accounts.tipster.name,
    bio: null, color_primario: "#34d399", tipster_status: "approved",
    ...(!profile.ok() ? { is_online: false, last_active_at: null, created_at: new Date(), followerCount: 0 } : {})
  });
  await writeVisualDocument(request, `usernames/${visualUsername}`, { uid });
  const social = await request.get(`${firestoreRoot}/perfiles_social/${uid}`, { headers });
  if (social.status() === 404) {
    await writeVisualDocument(request, `perfiles_social/${uid}`, {
      avatar_url: null, banner_url: null, kick_url: null, twitch_url: null,
      youtube_url: null, telegram_url: null, twitter_url: null, instagram_url: null
    });
  } else await checked(social);
  await writeVisualDocument(request, `platformAdmins/${accounts.owner.uid}`, { enabled: true });
  return accounts;
}
