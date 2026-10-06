export async function mockGooglePopup(page, { subject, email, name }) {
  await page.route("**/google-sign-in.js", route => route.fulfill({
    contentType: "text/javascript",
    body: `
      import { firebaseAuth } from "./firebase-config.js?v=2";
      import { GoogleAuthProvider, signInWithCredential } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
      export function signInGoogle() {
        if (!firebaseAuth.emulatorConfig) throw new Error("Google mock requires Auth Emulator.");
        const token = ${JSON.stringify(JSON.stringify({ sub: subject, email, email_verified: true, name }))};
        return signInWithCredential(firebaseAuth, GoogleAuthProvider.credential(token));
      }
    `
  }));
}
