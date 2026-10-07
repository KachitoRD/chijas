# Auditoría pre-migración: Fijas en vivo

**Fecha:** 2026-10-06
**Alcance:** análisis de `owner.html`, `admin.html` e `index.html` según la equivalencia de nombres indicada.
**Estado:** reporte de planificación; no se movió ni modificó código de la aplicación.

## Mapa de destinos

| Origen | Rol real | Destino | Qué migra |
|---|---|---|---|
| `owner.html` | Panel principal de Super Admin | `admin-dashboard.html` | Acceso administrativo, verificación de `platformAdmins`, ajustes, aprobaciones, solicitudes de perfil y gestión de tipsters. |
| `admin.html` | Panel operativo de tipster | `tipster-dashboard.html` | Acceso/registro tipster, gates legales y de aprobación, perfil, presencia, pronósticos, widget OBS y bankroll. |
| `index.html` | Vitrina pública más funciones de viewer autenticado | Separar entre el nuevo `index.html` y `user-profile.html` | Dejar vitrina, perfiles públicos de tipsters, feed y autenticación requerida para seguir en `index.html`. Llevar solo las funciones de cuenta privada que se definan para `user-profile.html`; no existe actualmente una pantalla de perfil propio o suscripciones que pueda trasladarse completa. |

## 1. Super Admin: `owner.html` → `admin-dashboard.html`

**Actualización del esquema de fijas:** las nuevas escrituras son canónicas (`event_date`, `sport`, `league`, `market`, `selection`, `odds`, `stake` en unidades públicas, `bookmaker`, `analysis`, `status`). `pick-schema.js` interpreta históricos sin reescribirlos al leer. El historial mantiene consultas separadas para `event_date`, `fecha_evento` y `event_start_at`; deben publicarse los nuevos índices conservando los legacy. `admin.html` reutiliza ahora el montaje de `tipster-view.js`, evitando un segundo escritor obsoleto. Los montos y retornos monetarios permanecen en `picks/{id}/private/bankroll`, accesible solo al propietario. Los términos críticos siguen bloqueados al iniciar el evento; se permite liquidar una única vez un resultado pendiente después del inicio. Cash out no cuenta como acierto/fallo y su retorno público proporcional sí participa en ROI/Yield ponderado por unidades cerradas; los históricos sin unidades/retorno se excluyen explícitamente de ese cálculo.

El módulo principal de `owner.html` está en `owner.html:182-745`. El markup del login, estados de acceso y panel aparece antes del módulo, aproximadamente en `owner.html:60-180`.

### Markup que debe acompañar la migración

- Formulario de acceso separado para el creador, botones Google y recuperación de contraseña.
- Estados de carga, acceso denegado, cambio de cuenta y cierre de sesión.
- Secciones del dashboard: resumen, modelo de acceso, límites, solicitudes de acceso, solicitudes de cambios de perfil y lista de tipsters.
- Mensajes por sección, indicadores `aria-busy`, contenedores dinámicos y controles de refresco.
- Mantener la estructura de navegación y actualizar los enlaces que hoy apuntan a `admin.html` para tipsters.

### Lógica y funciones

| Función / bloque | Responsabilidad | Destino |
|---|---|---|
| `createElement`, `notice`, `clearNotice` (`owner.html:195-211`) | Construcción segura de nodos y mensajes de estado. | Migrar o reemplazar por el patrón compartido sin interpolar datos de usuario en HTML. |
| `loadOwnerDashboard`, `showCreatorLogin` (`owner.html:211-226`) | Transición entre carga, acceso, rechazo y contenido administrativo. | Migrar con los estados de autenticación. |
| `loadSettings` (`owner.html:227`) | Lee `platformSettings/limits` y muestra los límites configurados. | Migrar junto al formulario de límites. |
| `loadApplications` (`owner.html:237`) y listener `applications` (`owner.html:483`) | Lista solicitudes pendientes y aprueba o rechaza. La aprobación se realiza en transacción y crea/actualiza perfil, perfil social, presencia y username. | Migrar completos: consulta, renderizado, validación de estado, transacción y feedback. |
| `profileChangeLabels`, `profileChangeValue`, `loadProfileChangeRequests` (`owner.html:276-377`) y listener `profileRequests` (`owner.html:568`) | Presenta cambios propuestos frente al perfil actual; los aprueba/rechaza, mantiene la reserva de username y actualiza perfil/social. | Migrar completos, junto con el markup para comparar campos y capturar el motivo de rechazo. |
| `loadTipsters` (`owner.html:378`) y listener `tipsters` (`owner.html:654`) | Lista aprobados/revocados, añade presencia y permite revocar/restaurar acceso. | Migrar completos. |
| Listeners de `creatorLoginForm`, `settingsForm`, `switchCreatorAccount` y `logout` (`owner.html:431-744`) | Inicio de sesión, guardado de límites y cierre/cambio de cuenta. | Migrar con sus mensajes, controles deshabilitados durante la operación y manejo de error. |
| `onAuthStateChanged` (`owner.html:706`) | Verifica sesión, correo verificado y autorización administrativa consultando `platformAdmins/{uid}`; no muestra el panel sin aprobación administrativa. | Migrar sin debilitarlo. La autenticación confirma identidad; el documento y las reglas de Firestore autorizan las operaciones. |

### Imports Firebase y colecciones

La página importa `firebase-config.js`, Firebase Auth, Firestore, `auth-ui.js` y `ui-feedback.js` (`owner.html:182-190`).

- **Auth:** `getAuth`, `onAuthStateChanged`, `signInWithEmailAndPassword`, `signOut`; además, helpers `installAuthModal`, `installGoogleAccess`, `installPasswordRecovery`.
- **Firestore:** `collection`, `doc`, `getDoc`, `getDocs`, `limit`, `orderBy`, `query`, `runTransaction`, `serverTimestamp`, `setDoc`, `where`.
- **Lecturas/escrituras:** `platformAdmins/{uid}`, `platformSettings/limits`, `tipsterApplications/{uid}`, `perfilSolicitudes/{id}`, `perfilSolicitudesPendientes/{uid}`, `perfiles/{uid}`, `perfiles_social/{uid}`, `presencia/{uid}`, `usernames/{username}`.
- **UI compartida:** `showSkeleton`, `installBusyButtons`, `toasts.js`; estilos `dist/styles.min.css`, `button-styles.css`, `dashboard-styles.css`, `emerald-surface.css`, `auth-styles.css` y `ui-polish.css`.
- Los valores de límites se describen en el producto como orientativos; no convertirlos en cuotas aplicadas solo desde el cliente.

### Condición de seguridad esencial

El guardado de límites, la revisión de aplicaciones, los cambios de perfil y la revocación/restauración solo deben estar disponibles para el Super Admin. No basta con ocultar el HTML: las reglas deben seguir exigiendo la identidad administrativa en el servidor.

## 2. Panel tipster: `admin.html` → `tipster-dashboard.html`

El markup del panel, login, tabs y formularios aparece aproximadamente en `admin.html:108-373`; el módulo principal empieza en `admin.html:374` y termina cerca de `admin.html:2180`.

### Markup que debe acompañar la migración

- Login/registro tipster, consentimiento legal, estado de verificación y estado de aprobación.
- Gate para solicitar acceso tipster o explicar estado pendiente/revocado.
- Tabs y vistas de pronósticos, widget y perfil.
- Formulario de publicación, historial/tabla, filtros, paginación, acciones, bankroll privado e informes.
- Formularios de perfil y solicitudes de cambio, edición de avatar/banner y preview del overlay.
- Estados de carga, mensajes, cancelación de edición y diálogos relacionados.

### Lógica y funciones

| Función / bloque | Responsabilidad | Destino |
|---|---|---|
| Auth y aceptación legal (`admin.html:538-586`, `admin.html:1724-1805`) | Registro/email, verificación, login, recuperación/Google, aceptación versionada de términos y logout. | Migrar junto con todos los formularios y estados que consume. |
| `getAccountState`, `showAccountGate`, `requestTipsterAccess` (`admin.html:680-746`) | Consulta estado del perfil/aplicación, determina si la UI muestra solicitud o panel, envía solicitud. | Migrar; mantener la validación real de permisos en Rules. |
| `fillProfile`, `renderProfileRequest`, `submitProfileRequest`, `loadProfileRequest`, `loadProfile` (`admin.html:747-1012`) | Carga perfil/social/presencia, propone cambios sujetos a revisión y muestra estado de solicitud. | Migrar con los formularios e imagenes correspondientes. |
| Presencia (`initializePresence`, `startPresenceInterval`, `handleVisibilityChange`, `setPresenceOffline`; `admin.html:615-674`) | Mantiene estado online y lo cierra al ocultar/cerrar sesión. | Migrar y asegurar limpieza de intervalos/listeners al cambiar sesión. |
| Picks (`renderPicks`, `subscribeToPicks`, `beginEdit`, `savePick`; `admin.html:1022-1634`) | Historial, filtros, consultas en vivo, paginación, publicación, edición, OBS y estado. | Migrar como una unidad con el markup y los manejadores. |
| Bloqueo de picks (`pickEventDate`, `pickLockReason`, `admin.html:1013-1021`) | Presenta bloqueos por evento iniciado o estado calificado y desactiva operaciones en interfaz. | Conservar el feedback; no sustituye las reglas Firestore que aplican el bloqueo. |
| Bankroll e informes (`admin.html:414-528`, `admin.html:1287-1462`) | Cálculo, subscriptions a importes privados, resumen, filtros, CSV/PDF y exportación. | Mantener dependencias `bankroll.js` y `bankroll-report.js`; comprobar que los importes privados no se expongan en el feed/perfil público. |
| Perfil visual y widget (`updateWidgetUrl`, Cropper y `installTabs`; `admin.html:814-836`, `admin.html:1635-1740`) | Enlace/previsualización OBS, selección de tabs y procesamiento de imágenes. | Migrar con CropperJS, formularios y sus hojas de estilo. |
| Listeners de picks, perfil e imágenes (`admin.html:1825-2025`) | Copia de enlace, formato OBS, cambios de estado, cash-out, eliminación, perfil y crop. | Migrar todos; evitar conservar manejadores que apunten a IDs que no existan en el markup nuevo. |
| `onAuthStateChanged` (`admin.html:2069-2178`) | Limpia subscriptions anteriores, verifica email, legal acceptance y estado de cuenta; redirige admins y carga panel solo para tipster aprobado. | Migrar completo, especialmente cleanup/generation y ramas de error. |

### Imports Firebase, colecciones y dependencias

Los imports están en `admin.html:374-384`.

- **Config compartida:** `firebase-config.js`; no crear una segunda app ni otra instancia Auth/Firestore.
- **Auth:** `createUserWithEmailAndPassword`, `getAuth`, `onAuthStateChanged`, `sendEmailVerification`, `signInWithEmailAndPassword`, `signOut`, `updateProfile`.
- **Firestore:** `collection`, `doc`, `getDoc`, `getDocs`, `onSnapshot`, `orderBy`, `query`, `runTransaction`, `serverTimestamp`, `setDoc`, `updateDoc`, `where`, `limit`, `startAfter`, `endAt`.
- **Colecciones/documentos:** `legalAcceptances/{uid}/versions/{version}`, `perfiles/{uid}`, `perfiles_social/{uid}`, `presencia/{uid}`, `tipsterApplications/{uid}`, `platformAdmins/{uid}`, `platformSettings/limits`, `perfilSolicitudes/{id}`, `perfilSolicitudesPendientes/{uid}`, `picks/{pickId}`, `picks/{pickId}/private/bankroll`.
- **Módulos locales:** `bankroll.js`, `bankroll-report.js`, `auth-ui.js`, `ui-feedback.js`, `firebase-config.js`, `toasts.js`.
- **Estilos/terceros:** `dist/styles.min.css`, `button-styles.css`, `emerald-surface.css`, `auth-styles.css`, `ui-polish.css`, CropperJS.

### Condiciones de seguridad y comportamiento

- La UI de registro no aprueba el rol tipster. Solo la aprobación/estado guardado en Firestore puede permitir operaciones; el cliente no debe conceder roles.
- Mantener consentimiento y correo verificado tal como están modelados y exigidos por reglas.
- Las escrituras de creación usan timestamps del servidor (`serverTimestamp()`); no reemplazar por el reloj del navegador.
- Los datos del bankroll son privados; no copiarlos a `picks` públicos, perfil o overlay.
- Los picks publicados/bloqueados requieren las reglas de inmutabilidad ya establecidas. La interfaz solo refleja esa restricción.

## 3. Vitrina y viewer: dividir `index.html`

### Se queda en `index.html`: superficie pública

El markup público está en `index.html:260-393`; el módulo de funciones empieza en `index.html:433`.

- Header, búsqueda, contador de conectados y feed Explorar.
- Directorio, avatares, presencia y filtros.
- Perfil público de tipster (`profileSection`) con perfil social, enlaces, seguimientos y picks públicos. Es una ruta `?u=...`; **no** es el perfil privado de viewer. Ver `index.html:345-393` y `index.html:981-1110`.
- Feed Siguiendo y sus tabs. Aunque personaliza contenido por usuario autenticado, sigue siendo parte de la vitrina y depende de la misma navegación/feed.
- Footer, avisos legales, estados de Firebase, listeners de perfiles/presencia y actualización del perfil público.
- Las funciones públicas incluyen `createElement`, `profileOnline`, `safeExternalUrl`, `safeImageSource`, `avatarNode`, `pickDate`, `badgeNode`, `profileHref`, `renderOnline`, `renderDirectory`, `renderFilters`, `renderStats`, `renderPicks`, `renderProfile`, `loadProfile` y `subscribeToProfiles` (`index.html:753-1147`).

### Auth y funciones comunitarias que debe conservar la vitrina

- El modal `viewerAuth` (login/registro, Google, recuperación, consentimiento de edad/términos) y modal `viewerConsent` están en `index.html:395-430`.
- `installViewerAccess()` provee la apertura/login del viewer desde `auth-ui.js`; `ensureViewer`, `setFollowing`, `subscribeFollowingFeed` están en `community.js`.
- `handleFollow`, `requestViewerConsent`, renderizado del feed, `onAuthStateChanged`, listener de `follows` y salida de sesión aparecen en `index.html:470-751`.
- Las operaciones usan `users/{uid}`, `follows/{viewerId}_{tipsterId}`, `legalAcceptances/{uid}/versions/{version}`, `platformAdmins/{uid}`, `perfiles`, `perfiles_social`, `presencia` y `picks`.
- Importa `firebase-config.js`, Auth/Firestore SDK, `community.js`, `auth-ui.js` y `ui-feedback.js` (`index.html:433-439`).

### Candidatos a `user-profile.html`: solo cuenta privada que exista o se defina

**Separación implementada:** la vitrina conserva autenticación, seguimiento y feed Siguiendo. El enlace «Mi cuenta» aparece con sesión activa y abre `user-profile.html`, protegido por Auth, con nombre, correo, UID y estado de verificación. Al cerrar sesión se ocultan y vacían los datos. Preferencias y suscripciones son espacios pendientes exclusivos de esa página; no se implementaron pagos ni nuevas escrituras de perfil.

La inspección del código actual no encontró un panel privado de perfil del viewer, edición de preferencias, gestión de cuenta ni lógica de suscripciones o pagos. En particular:

- `users/{uid}` se crea mediante `ensureViewer` como documento básico (`uid`, `role`, `displayName`, `photoURL`, `created_at`); no hay CRUD de perfil privado implementado en la página.
- El `profileSection` de `index.html` corresponde a perfiles públicos de tipsters.
- Las suscripciones actuales son listeners de Firestore (`onSnapshot`), no suscripciones comerciales.
- Suscripciones comerciales, planes, take rates, cobros y contenido premium no están activos según el estado del producto.

Por tanto, el destino nuevo puede recibir un shell autenticado de viewer y funciones de cuenta que se acuerden después, pero hoy no hay código de suscripciones que extraer. No mover el directorio, perfiles públicos ni feed Siguiendo a esa página.

## 4. Inicialización y dependencias compartidas

### RBAC y fuente autoritativa

- `permissions.js` centraliza `getAccountPermissions(user)` y `watchAccountPermissions(user, onChange, onError)` para navegación y visibilidad. Firestore Rules sigue autorizando cada operación; el resultado del navegador nunca concede permisos.
- Administración requiere correo verificado y `platformAdmins/{uid}` con `enabled: true` y `role: "super_admin"` o `"admin"`. Una ACL antigua sin campo `role` conserva el acceso como `super_admin`; un campo presente inválido o `enabled: false` no concede acceso. La ACL se provisiona fuera del cliente (Consola o Admin SDK); ningún cliente puede crearla ni actualizarla.
- El permiso de publicación se deriva exclusivamente de `perfiles/{uid}.tipster_status == "approved"` y correo verificado. `users.role` no es autoritativo. Una cuenta administrativa no obtiene acceso a picks ajenos; un perfil aprobado puede publicar sus picks bajo las restricciones existentes.
- Se conservan las validaciones de esquema, consentimiento, timestamps de servidor, bloqueo por inicio del evento/estado, bankroll privado y follows atómicos. Las lecturas públicas permanecen públicas por diseño. `users` permite lectura y creación propias; editar/borrar ese documento sigue fuera del alcance actual.
- `admin-dashboard.html` no muestra el panel hasta validar la ACL y lo oculta ante revocación o error. `tipster-dashboard.html` mantiene la solicitud de acceso y desactiva sus herramientas al revocarse la aprobación. `owner.html` e `index.html` usan el mismo resolver para conservar la compatibilidad de las rutas anteriores.
- `e2e/rbac.spec.js` verifica las ACL, roles inválidos/deshabilitados, revocación en vivo, correo verificado, rechazo de autoasignación y publicación por tipster aprobado. Ejecutar exclusivamente con emuladores `demo-fijas-vivo`; los cambios no están publicados en producción.

1. Las tres páginas deben reutilizar `firebase-config.js`, que inicializa Firebase SDK 10.14.1 y enlaza Auth/Firestore Emulator en localhost. No replicar `initializeApp`/`initializeAuth` en cada página.
2. Mantener imports existentes como módulos ES; revisar rutas relativas tras renombrar archivos.
3. Compartir/reutilizar `auth-ui.js`, `community.js`, `ui-feedback.js`, `bankroll.js`, `bankroll-report.js` y `toasts.js`; no copiar funciones que ya pertenecen a módulos.
4. Las originales cargan `dist/styles.min.css` y CSS de la plataforma; las plantillas nuevas usan Tailwind CDN. Al portar markup dinámico, verificar clases generadas y conservar estilos requeridos; no mezclar la migración funcional con un cambio de estrategia CSS sin validarlo aparte.
5. La detección de rol en cliente sirve para navegación/UX únicamente. Firestore Rules son la autoridad de autorización para todos los datos y escrituras.

## 5. Referencias que deben actualizarse al migrar

Buscar referencias a `owner.html` y `admin.html` en HTML, JS, pruebas, seeds y configuración de rutas. Confirmadas en los archivos inspeccionados:

- `index.html` mantiene la sesión de viewer para todos los roles. Su menú dinámico monta `admin-dashboard.js` o `tipster-view.js` nativamente en la columna central usando las plantillas HTML existentes; ya no redirige automáticamente al iniciar sesión. El feed permanece montado y conserva filtros y scroll. Las rutas `#view=admin` y `#view=tipster` admiten historial y restauración; una revocación cierra la vista y limpia sus listeners. No hay iframes de navegación; se conserva únicamente la previsualización OBS. `users.role` no otorga acceso.
- `owner.html` enlaza a `admin.html` para acceso tipster/lector.
- `admin.html` redirige al Super Admin a `owner.html`.
- Los tests Playwright y el recorrido visual sembrado abren `admin.html`/`owner.html`; deben cambiar a `tipster-dashboard.html`/`admin-dashboard.html` cuando esas páginas estén listas.
- El enlace a perfiles públicos con `?u=` debe seguir apuntando a `index.html`.
- Para `user-profile.html`, definir explícitamente el enlace de navegación y qué acciones privadas ofrece antes de mover controles desde la vitrina.

## 6. Secuencia sugerida y criterios de aceptación

1. **Super Admin:** portar markup y módulo de `owner.html` a `admin-dashboard.html`; comprobar sesión, correo verificado, consulta `platformAdmins/{uid}`, lectura/escritura de configuración y aprobaciones.
2. **Tipster:** portar `admin.html` a `tipster-dashboard.html`; comprobar registro/login, consentimiento, gate de aprobación, perfil/presencia, picks, bankroll y overlay.
3. **Vitrina:** dejar en `index.html` directorio, perfiles públicos, Explorar/Siguiendo y el Auth/follow que esos flujos requieren.
4. **Perfil viewer:** implementar solo el alcance de cuenta privada acordado; no inventar suscripciones ni permisos desde el cliente.
5. **Rutas y pruebas:** actualizar enlaces, redirects, E2E, visual tests y seeds al nuevo mapa.
6. **Criterio de no regresión:** probar los roles separados (viewer, tipster aprobado/no aprobado y Super Admin), navegación a perfiles públicos, seguimiento y cierre de sesión. Ejecutar solo contra emuladores `demo-fijas-vivo`; nunca contra `chijas`.

### Decisiones pendientes antes de mover código

- Qué información y acciones exactas debe mostrar `user-profile.html` para el viewer, dado que la implementación actual solo crea el documento básico.
- Si Auth/modal de viewer y feed Siguiendo permanecerán en la vitrina (recomendado por su dependencia funcional) o si parte de la experiencia de cuenta se separará con un enlace explícito de retorno.
- Confirmar el inventario de referencias en todos los tests/configuración justo antes de cambiar rutas; este informe confirma las referencias directas descritas, no reemplaza esa pasada de migración.

## 7. Core administrativo y permisos actuales

- `admin-dashboard.html` utiliza `admin-dashboard.js` y `admin-services.js` con la instancia central de Firebase. La autorización efectiva procede de `platformAdmins`, no de `users.role`.
- `super_admin` dispone de gobierno, límites, comisiones y operaciones. Un `admin` solo recibe los permisos operativos `tipsters`, `profiles`, `viewers` y `kpis`; sin lista explícita conserva todos esos permisos por compatibilidad. Una ACL habilitada antigua sin `role` conserva el significado de Super Admin.
- Solo un Super Admin puede modificar ACL de otros usuarios. No puede modificar su propia ACL; las revocaciones usan `enabled: false`. La asignación múltiple admite hasta 25 UID. No se comprueba desde este cliente que cada UID exista en Firebase Auth.
- `tipsterFinance/{uid}` contiene únicamente `takeRate` (porcentaje 0–100) y auditoría. Su lectura y escritura son exclusivas de Super Admin: el permiso `kpis`, la propiedad del documento y los demás roles no conceden acceso financiero. No existe un permiso financiero granular en el modelo actual. Las escrituras requieren un perfil aprobado, `serverTimestamp` y el UID del actor; se prohíbe eliminar documentos.
- Las métricas muestran cantidad de pronósticos, tipsters aprobados, conexiones estimadas y acierto: ganadas / (ganadas + perdidas). GMV, ingresos brutos y netos indican «No disponible»: no hay una fuente monetaria autorizada y el bankroll privado no se usa como ingresos.
- `viewerPresence` es privada. El heartbeat del viewer se actualiza cada 30 segundos y expira en la estimación a los 90 segundos; no representa sesiones certificadas de Firebase Auth.
- La moderación actualiza `users.status` y la presencia mediante transacción. Las reglas y las superficies privadas reaccionan a la suspensión, pero no se deshabilita la cuenta de Firebase Auth y la vitrina sigue siendo pública.
- Las aprobaciones mantienen solicitudes, perfiles y usernames en transacciones. Las actualizaciones de presencia no vuelven a renderizar formularios financieros o de gobierno ni descartan sus valores en edición.
- Los listeners de KPIs consultan colecciones completas. Para escalar será necesario agregar métricas en un backend y revisar coste, paginación y observabilidad.
- Las reglas son un prototipo comprobado con emuladores; requieren revisión antes de abrir el acceso ampliamente. No se han desplegado estos cambios.