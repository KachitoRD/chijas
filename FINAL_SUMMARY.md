# Fijas en vivo - Resumen técnico actual

## 1. Stack tecnológico
- HTML5, JavaScript vanilla con módulos ES y CSS; Tailwind CSS 3 compilado con Node.js, PostCSS y Autoprefixer.
- Firebase Authentication, Cloud Firestore y Firebase Hosting (proyecto `chijas`); emuladores locales de Auth y Firestore.
- Playwright para pruebas E2E y ESLint para análisis estático. Sin framework frontend, Cloud Functions ni Firebase Storage.

## 2. Base de datos y modelos definidos
Cloud Firestore, base NoSQL con colecciones (no tablas SQL):
- `perfiles`: identidad pública y estado de acceso del tipster; `perfiles_social`: avatar, banner y redes.
- `picks`: pronósticos, evento, cuota, confianza, resultado y selección para mostrar en stream.
- `picks/{pickId}/private/bankroll`: importe y moneda privados, accesibles solo al dueño desde el SDK cliente; creación/edición/borrado integrados en transacciones.
- `presencia`: conexión y última actividad; `usernames`: asociación de usuario público con UID.
- `tipsterApplications`: solicitudes de acceso; `perfilSolicitudes`: cambios de perfil para revisión; `perfilSolicitudesPendientes`: reserva de una solicitud activa por usuario.
- `platformAdmins`: permisos del creador; `platformSettings`: límites orientativos.
- `legalAcceptances/{uid}/versions/{version}`: aceptación versionada de términos, privacidad y confirmación de edad.
Firebase Authentication gestiona cuentas, contraseñas y verificación de correo; Firestore tiene reglas de acceso e índices definidos.

## 3. Funcionalidades y estado
- **Implementadas:** registro/login, verificación de correo, recuperación de contraseña y aceptación legal; directorio con búsqueda, perfiles públicos, presencia, pronósticos y resultados.
- **Implementadas:** panel tipster para publicar/editar/eliminar pronósticos, marcar resultados y solicitar cambios de perfil; panel creador para aprobar/rechazar solicitudes, gestionar permisos y límites.
- **Implementado:** dashboard financiero privado por moneda (PEN, USD y EUR) con riesgo, retorno, profit neto y Yield; filtros por fecha del evento (mes en curso o rango), estado, deporte y casa. Historial completo paginado y exportación local CSV para Excel y PDF ejecutivo con efectividad global y métricas por moneda. Cierre anticipado total con retorno real privado y estado público, excluido de aciertos. No gestiona saldo de cuenta, comisiones ni retiros parciales.
- **Implementado:** widget público para OBS/Streamlabs con picks seleccionados, tres formatos y vista previa. Sin pagos ni suscripciones activas; los límites mensuales son orientativos.
- **Verificado localmente:** restauración visual con Tailwind 3, acceso del creador y tipster, restricciones de cuenta pendiente, búsqueda y perfiles; cinco escenarios aprobados en Chromium y Firefox, con comprobaciones de escritorio/móvil.
- **En proceso:** prueba completa de publicación/resultados/widget y resolver el bloqueo de acceso al emulador en WebKit. Restauración CSS y correcciones recientes aún sin commit ni deploy; Service Worker desactivado.
