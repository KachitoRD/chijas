# Firebase en el plan gratuito

La aplicación usa Firebase Authentication y Cloud Firestore desde el navegador. No usa Firebase Storage ni Cloud Functions; `firebase.json` configura Hosting, Firestore y emuladores locales, sin requerir activar Blaze ni asociar una tarjeta para estos servicios.

## Configuración inicial

### Validación antes de publicar

Ejecuta `npx playwright test auth-access.spec.js community.spec.js ui-polish.spec.js --workers=1` contra los emuladores activos y revisa `git diff --check` junto con los archivos nuevos de `git status --short`. El Hosting excluye tests, seeds, scripts de desarrollo, configuraciones de tooling, logs, informes y demos; las páginas principales, módulos de aplicación y estilos siguen publicados. No uses el seed anterior que vacía los emuladores para este recorrido.

Tras revisar el diff y completar los datos legales, publica reglas, índices y Hosting juntos mediante `firebase deploy --only firestore:rules,firestore:indexes,hosting --project chijas`. El despliegue requiere aprobación explícita; las pruebas locales no sustituyen la comprobación posterior en HTTPS de login, permisos Owner, follows, publicación y OBS. Las cuentas locales no existen automáticamente en producción.

### Previsualización y revisión visual local

Para el recorrido visual con cuentas persistentes de prueba, ejecuta `npm run test:visual:seeded`. La dependencia `seed-emulators` se ejecuta antes del navegador: crea o actualiza `viewer_test@fijasenvivo.local`, `tipster_test@fijasenvivo.local` y `owner_test@fijasenvivo.local` con contraseña local `Test123456!` y correo verificado. Es exclusiva de Auth 9099 y Firestore 8080 del proyecto `demo-fijas-vivo`; no borra los emuladores. El tipster se aprueba en `perfiles` y el owner se habilita en `platformAdmins`, sin cambiar las reglas de producción. Los roles sembrados en `users` son metadatos de fixture, no la fuente de autorización. Chromium abre con `headless: false` y `slowMo: 1000`; el recorrido valida modales, follows/contador, publicación/feed, OBS sin sesión y métricas owner. Conserva las cuentas y limpia solo su nueva fija y restaura el seguimiento previo. No ejecutes dos recorridos simultáneos con estas mismas cuentas.

Los accesos de viewer, tipster y creador usan diálogos nativos con backdrop difuminado. En los paneles, el fondo es una estructura estática sin datos privados: las consultas protegidas siguen dependiendo de la sesión y los permisos. El clic exterior o Escape solo cierran si todos los campos están vacíos y no hay una operación pendiente; en tipster/creador vuelven al inicio. El cierre tras autenticar usa un desvanecimiento de 180 ms, inmediato con movimiento reducido. El registro de tipsters conserva la verificación y el consentimiento; el acceso owner no permite crear ni conceder permisos administrativos.

Mantén Auth (9099) y Firestore (8080) activos y sirve la raíz del proyecto desde Live Preview o Live Server por HTTP. Los estilos compartidos `ui-polish.css` y `auth-styles.css` se cargan directamente: guardar CSS o JavaScript no requiere compilación. Si cambias utilidades Tailwind, ejecuta `npm run build:css`; el servidor debe servir archivos sin caché para mostrar el CSS generado inmediatamente.

Los campos, etiquetas, bordes, estados hover/disabled y foco esmeralda de las tres vistas se centralizan en `ui-polish.css`; `auth-styles.css` conserva la estructura de los diálogos y los controles de consentimiento. Evita duplicar estos estilos en los HTML. Si usas el servidor alternativo `npx --no-install http-server . -p 5500 -c-1`, recarga el navegador integrado después de guardar: este servidor desactiva la caché, pero no incorpora la recarga automática de la extensión Live Preview.

Para inspeccionar las interacciones en un navegador visible: `npm run test:visual` o `npx playwright test ui-polish.spec.js --project=chromium --headed --workers=1`. Para los tres motores sin ventana, usa `npx playwright test auth-access.spec.js community.spec.js ui-polish.spec.js --workers=1`. Playwright utiliza `http://localhost:5500` y reutiliza el servidor existente; no reinicia emuladores ni elimina datos ajenos a sus fixtures. Las capturas escritorio/móvil y trazas quedan en la carpeta temporal del sistema, dentro de `fijas-en-vivo-playwright` y un identificador del repositorio; el informe de Playwright permite abrir los adjuntos. Guardarlas fuera del proyecto evita que Live Preview/Live Server recargue la página en medio de una prueba al detectar nuevas capturas.

1. En **Authentication > Sign-in method**, habilita **Correo electrónico/contraseña**.
   Habilita también **Google** y configura el correo de soporte para el acceso de viewers. Las sesiones usan `browserLocalPersistence`; Live Preview, Live Server y Playwright deben servir el sitio por HTTP en `localhost`, `127.0.0.1` o `[::1]`, que conectan automáticamente al proyecto emulado `demo-fijas-vivo`. No abras los HTML mediante `file://`.
2. En **Authentication > Settings > Authorized domains**, autoriza el dominio de prueba. Para el servidor local, registra `localhost` (sin protocolo ni puerto) y abre `http://localhost:4173/`.
3. Confirma que existe la base de datos predeterminada en **Firestore Database**.
4. Revisa y completa los datos legales pendientes en `legal.html` y solicita una revisión profesional en Perú antes de abrir el registro públicamente. La casilla de edad es una declaración del usuario, no una verificación de edad.
5. Desde PowerShell, en la carpeta del proyecto, publica las reglas e índices:

   ```powershell
   firebase login
   firebase deploy --only firestore:rules,firestore:indexes --project chijas
   ```

   Este comando no despliega funciones, no usa Storage y no activa facturación. Spark sí tiene cuotas gratuitas de Authentication y Firestore; Firebase puede limitar el servicio al alcanzar sus cuotas, pero el proyecto no debe cambiarse a Blaze sin tu autorización.

## Dar de alta una cuenta creadora separada

1. En `admin.html`, crea una cuenta nueva con un correo distinto al que usas como tipster o lector y verifica el correo.
2. En Firebase Console, abre **Authentication > Users** y copia el UID de esa cuenta creadora.
3. En Firestore Console, crea `platformAdmins/{UID}` con el campo `enabled` de tipo booleano y valor `true`. Este permiso inicial solo se puede asignar desde Firebase Console; las reglas bloquean su escritura desde la web.
4. Abre [owner.html](http://localhost:4173/owner.html) e inicia sesión con las credenciales de la cuenta creadora. La cuenta administrativa verificada y autorizada está exenta de la aceptación de usuario final; el consentimiento sigue siendo obligatorio para las cuentas de lectores y tipsters. Si hay otra cuenta iniciada, cierra esa sesión desde el panel de creador antes de entrar.
5. La cuenta creadora tiene su propio acceso al dashboard; al usarla en el acceso tipster/lector, la aplicación la redirige al panel de creador.

El panel incluye solicitudes pendientes y una lista de tipsters aprobados o revocados. Desde esa lista puedes revocar o restaurar el permiso de publicación. No enumera todas las cuentas de Firebase: para usuarios que nunca hayan solicitado acceso y para nombrar a otros creadores, usa Firebase Console.

## Widget de pronósticos para OBS

Los tipsters aprobados pueden elegir en **Pronósticos** qué publicaciones aparecerán en su transmisión. La pestaña **Widget OBS** ofrece los formatos **Cascada**, **Compacto** y **Marcador**, disponibles gratis durante las pruebas, y genera una URL pública para añadir como fuente **Navegador / Browser Source** en OBS, Streamlabs u otro programa compatible. La lista se actualiza en tiempo real al marcar, quitar o editar pronósticos. Cascada anima la entrada inicial y deja quietos los picks para que puedan leerse.

Los formatos de pago son una posible etapa futura, no están activos ni se cobran. Cuando se definan planes, todos los formatos actualmente disponibles deben seguir accesibles durante las pruebas; no se debe confiar en un parámetro de URL o en una interfaz bloqueada para validar suscripciones. El acceso comercial requerirá verificación de pagos en una capa de servidor confiable y aprobación explícita antes de activar cobros.

- Copia la URL desde el panel y pégala como fuente de navegador.
- Mantén transparente el fondo de la fuente. Ajusta sus dimensiones para que quepan todos los pronósticos seleccionados.
- El enlace no es una contraseña: los perfiles y pronósticos ya son públicos. No incluye correo, UID ni información privada.
- Durante las pruebas locales, `localhost` solo funciona desde el mismo equipo. Para transmitir con el widget desde otro equipo, la plataforma debe estar publicada en un dominio HTTPS accesible.
- Tras publicar las reglas, un pronóstico antiguo sin `show_on_stream` se mantiene fuera del widget hasta que su tipster lo seleccione. El widget ordena localmente los pronósticos seleccionados y no depende de un índice compuesto adicional.
- Publica los cambios de seguridad e índice antes de probarlo: `firebase deploy --only firestore:rules,firestore:indexes --project chijas`. Esto no despliega Functions ni requiere activar Blaze.

## Modelo de acceso: pruebas y etapa futura

### Viewers y seguimientos

El directorio permite registrarse e iniciar sesión por correo/contraseña, o entrar con Google sin abandonar la página. El registro por correo exige consentimiento y envía un enlace de verificación antes de habilitar los seguimientos. La recuperación de contraseña está disponible explícitamente en el modal de viewers, el panel tipster y el acceso del owner; los tres usan `sendPasswordResetEmail`.

En local, Firebase Auth Emulator presenta su selector de identidad de prueba para Google: no utiliza una cuenta real de Google. En producción, autoriza el dominio HTTPS y habilita el proveedor Google en Firebase Console. Los helpers de Playwright interceptan exclusivamente `google-sign-in.js` y usan una credencial Google de prueba contra Auth Emulator; no hay mocks, flags de test ni bypass de permisos en la aplicación publicada.

Para validar los accesos y la comunidad, ejecuta `npx playwright test 'auth-access.spec.js' 'community.spec.js' --workers=1`. Los tests comprueban registro, correo verificado, recuperación real mediante los códigos OOB del emulador, sesiones persistentes, permisos de owner, follows y feeds. No vacían los emuladores ni requieren un iframe externo de Google.

En el primer acceso se crea `users/{uid}` con `role: "viewer"`; solo su dueño puede leerlo. Este rol no concede permisos de publicación ni administración. Antes del primer seguimiento se registra la aceptación legal vigente y la declaración de edad, igual que en el registro existente.

`follows/{followerId}_{tipsterId}` guarda `followerId`, `tipsterId` y `created_at`. La creación o eliminación y el cambio de `perfiles/{tipsterId}.followerCount` se ejecutan en una sola transacción. `followerCountUpdatedBy` permite que las reglas comprueben la relación exacta que justifica el incremento o decremento; no se permite editar el contador de forma aislada. Los perfiles anteriores sin contador empiezan en cero al recibir su primer seguimiento; no se requiere migración mientras no existan relaciones previas.

La pestaña **Siguiendo** consulta únicamente tipsters aprobados, en grupos de hasta 10 IDs, combina y ordena los resultados y muestra hasta 60 pronósticos recientes. Los listeners se cancelan al cambiar de pestaña, cuenta o lista de creadores. Un tipster revocado deja de aparecer en el feed, conservando su relación para cuando se restaure el permiso.

Publica las reglas actualizadas y el índice existente `picks(user_id, created_at)` antes de probar en producción. El emulador de Firestore recarga las reglas al guardar el archivo; no es necesario reiniciar procesos ni borrar datos locales. Para validar exclusivamente esta funcionalidad: `npx playwright test e2e/community.spec.js --project=chromium --workers=1`. Las pruebas crean y eliminan únicamente sus propios documentos y cuentas, sin reiniciar ni vaciar los emuladores.

Durante el MVP hay un solo nivel activo: **Inicial gratuito**. La aprobación permite que un tipster administre su perfil y sus pronósticos; no concede acceso de creador ni limita la cantidad mensual. El panel muestra los conceptos futuros como referencia, pero todavía no asigna planes ni distintivos.

Mantén independientes estos conceptos para la siguiente etapa:

- **Permiso:** pendiente, aprobado o revocado. Decide si la cuenta puede publicar.
- **Reconocimiento:** por ejemplo, verificado por el equipo según historial y criterios públicos. No se compra y no concede por sí mismo permisos de administración.
- **Plan comercial:** cuando exista monetización, representará una suscripción validada. Un plan pagado no debe equivaler automáticamente a «verificado».

El orden recomendado es conservar el flujo gratuito de aprobación durante las pruebas; definir y publicar los criterios del distintivo; y solo luego implementar planes para lectores, pagos y reparto con una capa de servidor confiable. No añadas un campo `premium` editable desde el navegador ni bloquees contenido según una etiqueta cliente: las reglas actuales mantienen públicos los picks y no verifican pagos. Los límites configurables siguen siendo orientativos.

## Probar con otra cuenta

1. Abre `admin.html`, pulsa **Crear cuenta** y registra un correo distinto al del creador.
2. Confirma que puedes leer los Términos y condiciones y el Aviso de privacidad; declara la edad mínima y acepta ambos antes de crear la cuenta.
3. Verifica ese correo, inicia sesión y envía una solicitud de tipster. Si una cuenta anterior no tiene aceptación de la versión actual, deberá aceptarla antes de continuar.
4. Abre `owner.html` con la cuenta creadora y aprueba la solicitud.
5. Entra de nuevo con la cuenta de prueba. Ya podrá editar su perfil y publicar pronósticos.

Firestore Security Rules controla los permisos, no solo la interfaz: la aceptación de la versión vigente queda registrada de forma inmutable en `legalAcceptances/{uid}/versions/{version}`; las cuentas verificadas con aceptación pueden solicitar acceso, solo el creador puede aprobarlas, y únicamente perfiles aprobados pueden publicar, editar o borrar sus pronósticos. Los picks continúan siendo públicos para el MVP.

## Términos y aviso de privacidad

`legal.html` contiene un borrador informativo para la operación desde Perú y usuarios internacionales, no asesoría legal ni una garantía de exención de responsabilidad. Antes de ofrecer el servicio al público, completa el nombre legal, domicilio cuando corresponda y correo de contacto del responsable; valida finalidades, plazos de conservación, derechos de privacidad, transferencias internacionales, jurisdicción y protección al consumidor con asesoría profesional. Revisa las reglas de edad y promoción de apuestas en cada mercado. La confirmación de mayoría de edad es una declaración, no una verificación documental.

El alta exige aceptar ambos documentos y confirmar edad. Se guarda una constancia con versiones y hora del servidor; la escritura es inmutable desde el cliente. Al cambiar las versiones legales, actualiza `TERMS_VERSION` y `PRIVACY_VERSION` en `admin.html`, la versión visible en `legal.html` y la versión correspondiente en `firestore.rules`. Publica las reglas nuevas antes de reabrir el acceso: la aplicación necesita poder leer la constancia y las reglas protegen las escrituras hasta que exista aceptación vigente. El usuario deberá aceptar nuevamente antes de usar funciones protegidas.

## Límites y monetización futura

El panel del creador guarda un límite orientativo de publicaciones mensuales para tipsters (inicialmente 50) y una configuración preparatoria de lecturas mensuales (inicialmente 20). En Spark estos valores son informativos: **no bloquean publicaciones ni lecturas**. No se ofrecen pronósticos de pago ni se debe presentar ese límite como una garantía. Para aplicar cuotas fiables, controlar planes de suscripción o ocultar pronósticos de pago hará falta una capa de servidor confiable; las reglas de Firestore no sustituyen esa lógica.

## Imágenes y tamaño de Firestore

Los avatares y banners se recortan en el navegador, se comprimen y guardan como Base64 en el perfil. No se importa ni utiliza Firebase Storage. El avatar puede ocupar hasta 200 KiB y el banner hasta 660 KiB. Firestore limita cada documento a 1 MiB; las imágenes también aumentan el tamaño de cada lectura de perfil.

## Datos anteriores

Si ya hay perfiles en Firestore de antes de las reglas de aprobación, revisa cada uno antes del despliegue. A los tipsters que conservarán acceso se les debe asignar `tipster_status: "approved"` y asegurar que existe `usernames/{username}` con el UID correcto; de lo contrario no aparecerán en el directorio ni podrán guardar el perfil.

## Colecciones principales

- `platformAdmins/{uid}`: cuentas creadoras, sembradas desde Firebase Console.
- `platformSettings/limits`: valores orientativos configurables por el creador.
- `legalAcceptances/{uid}/versions/{version}`: constancia privada e inmutable de aceptación de términos, privacidad y declaración de edad.
- `tipsterApplications/{uid}`: solicitud privada del lector al creador.
- `perfiles/{uid}`: perfil público una vez que se aprueba la solicitud.
- `usernames/{username}`: reserva pública de los nombres aprobados.
- `picks/{id}`: pronósticos públicos; las reglas exigen un tipster aprobado y limitan las escrituras a su propietario. `show_on_stream` es un booleano opcional que el tipster puede activar para incluir ese pronóstico en su widget.

La presencia significa que el tipster mantiene abierta su sesión del panel; no indica que esté transmitiendo en Twitch, Kick u otra plataforma.

El inicio muestra hasta 20 tipsters conectados directamente en una parrilla, sin desplegable: avatar circular (inicial si no hay imagen), punto esmeralda y nickname. Los placeholders conservan la estructura y altura de las tarjetas; permanecen hasta recibir la presencia inicial de los perfiles. Para previsualizar un conectado, mantén abierto su panel tipster en otra pestaña: la presencia caduca cuando deja de actualizarse. La tarjeta de límites owner conserva el grid de una columna/dos desde `md`, etiquetas alineadas e inputs translúcidos compartidos.

## Revisar JavaScript con ESLint

ESLint y sus dependencias son herramientas gratuitas de desarrollo. Instálalas una vez en la carpeta del proyecto y ejecuta la revisión antes de publicar cambios:

```powershell
npm install
npm run lint
```

La configuración revisa los archivos JavaScript y el JavaScript embebido en las páginas HTML. Para ver los avisos directamente mientras editas, instala la extensión **ESLint** oficial en VS Code.

## Limitaciones conocidas

- La actualización de `perfiles_social` está cerca del límite de 1.000 expresiones de Firestore.
- Algunas operaciones inválidas se deniegan, pero el motivo puede ser el límite de expresiones y no la condición específica, como HTTPS o `tipster_status`.
- La Sub-fase B, con solicitudes de cambios de perfil aprobadas por un admin, elimina la actualización compleja del tipster y resolverá este problema de raíz.
- Mientras tanto, si falla una actualización legítima del perfil, edita un campo a la vez.
