# Fijas en vivo - Resumen ejecutivo tecnico

Actualizado: 2026-10-05. Fase: cierre del MVP, despliegue tecnico y verificacion HTTPS.
Hosting, reglas e indices publicados en `chijas`; sitio: https://chijas.web.app.

## Arquitectura

Aplicacion estatica HTML5 y JavaScript con modulos ES, Firebase SDK 10.14.1
(Auth, Firestore y Hosting), Tailwind CSS 3.4 y estilos compartidos glassmorphism
esmeralda. Sin servidor API propio ni framework SPA: los clientes consultan
Firestore directamente bajo sus reglas de seguridad. ESLint y Playwright son
herramientas de desarrollo, no dependencias servidas al usuario.

## Construido

- Frontpage: directorio, hasta 20 tipsters conectados, avatares circulares,
  presencia, perfiles publicos y feeds Explorar/Siguiendo en tiempo real.
- Viewers: registro/login por correo, Google alternativo, persistencia local,
  recuperacion de contrasena, consentimiento legal y verificacion de correo.
- Follow/unfollow optimista: relacion determinista y contador atomico mediante
  transacciones; feed segmentado en grupos de diez tipsters.
- Tipster: solicitud/aprobacion, perfil, publicacion y gestion de pronosticos,
  historial, seguidores, bankroll privado e informes.
- Owner: acceso administrativo separado, solicitudes, cambios de perfil,
  aprobacion/revocacion y resumen de acceso. Limites mensuales orientativos:
  no son cuotas de consumo aplicadas por el backend.
- OBS: overlay publico del tipster, actualizado desde Firestore.
- UI compartida: modales nativos con backdrop seguro, skeletons, estados de carga,
  campos translucidos, foco accesible, responsive y movimiento reducido.
  Gradiente neon limitado al hero y tres enfasis del frontpage.

## Datos y permisos

Firestore usa colecciones, no tablas SQL. `users/{uid}` es privado y se crea
como viewer desde el cliente; su campo role no concede permisos.
`perfiles/{uid}.tipster_status == "approved"` habilita al tipster.
`platformAdmins/{uid}.enabled == true` autoriza al owner, provisionado fuera
del registro publico. Existen perfiles sociales, presencia, usernames,
solicitudes, pronosticos y bankroll privado. `follows/{viewerId}_{tipsterId}`
guarda followerId/tipsterId; las reglas exigen actualizar su contador en la
misma operacion atomica y bloquean suplantacion y escalada de roles.

## Validacion y operacion

- Antes de este cierre: 57/57 escenarios E2E aprobados en Chromium, Firefox y
  WebKit; 11/11 pruebas unitarias de bankroll aprobadas.
- En este cierre: 24/24 pruebas visuales aprobadas en los tres motores,
  incluyendo alcance exclusivo del gradiente y modo de alto contraste.
- Recorrido visual sembrado aprobado: login, modales, follow/contador,
  publicacion/feed, OBS y acceso owner. Google se simula solo en tests.
- Emuladores: Auth 9099, Firestore 8080, proyecto `demo-fijas-vivo`.
  Produccion: proyecto `chijas`; la deteccion local no usa sus datos.
- Live Preview integrado por HTTP. El servidor alternativo sin cache requiere
  recarga manual. `npm run test:visual:seeded` ejecuta el recorrido grafico.
- Hosting excluye tests, seeds, logs, informes, demos, documentos y tooling.
  Las carpetas ocultas y sus descendientes tambien quedan excluidos.
  Se conservan los tests fuente; los artefactos generados son desechables.
- Release: `firebase deploy --only firestore:rules,firestore:indexes,hosting --project chijas`.

## Cierre y fases futuras

Este MVP permite pruebas y publicacion tecnica; no equivale a certificacion
de seguridad ni aprobacion legal. Antes de abrir el registro publico:
completar operador/contacto y documentos legales, revisar obligaciones locales,
comprobar proveedores Auth/dominios autorizados y ejecutar smoke tests HTTPS
con cuentas reales. Las cuentas del emulador no se crean en produccion.

Futuro: suscripciones/paywalls con autorizacion backend, pagos y reparto,
notificaciones, criterios de verificacion editorial, cuotas reales, moderacion
ampliada y observabilidad. Follows y feed personalizado ya estan implementados.
