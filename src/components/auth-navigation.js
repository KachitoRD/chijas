export async function signOutAndRedirect(signOutSession) {
  await signOutSession();
  window.location.assign("/src/views/public-tipsters.html");
}
