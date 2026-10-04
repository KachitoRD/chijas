# Firestore rules emulator tests

1. Install the isolated test dependency once:

   ```sh
   npm install --prefix tests
   ```

2. Start the local emulators from the repository root:

   ```sh
   firebase emulators:start --only auth,firestore --project demo-fijas-vivo
   ```

3. In another terminal, run:

   ```sh
   node tests/rules.test.js
   ```

The test runner is hard-coded to the Auth and Firestore emulator loopback
addresses (`127.0.0.1:9099` and `127.0.0.1:8080`) and the demo project ID.
It refuses to run if either emulator is unreachable. Before each case, it
clears Auth and Firestore emulator data, then seeds required fixtures through
the Firestore emulator's local owner endpoint. Tested operations use the
Firebase client SDK and are evaluated by `firestore.rules`.
