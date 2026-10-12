# Arquitectura y calidad

**Actualizado: 11 de octubre de 2026**

## Visión general

Fijas en vivo es una aplicación web estática, organizada en páginas HTML y módulos JavaScript ES nativos. No utiliza un framework SPA, un servidor API propio ni una capa de backend de aplicación. El navegador se comunica con Firebase usando el SDK web bajo las reglas configuradas en Firestore.

```text
Navegador
  ├─ HTML + módulos ES + CSS
  ├─ Firebase Authentication (identidad y sesión)
  └─ Cloud Firestore (lecturas/escrituras en tiempo real sujetas a reglas)
           │
           └─ Firebase Hosting (publicación de archivos estáticos)

Desarrollo y pruebas
  ├─ Emulador Auth: localhost:9099
  ├─ Emulador Firestore: localhost:8080
  ├─ UI de emuladores: localhost:4000
  └─ Servidor HTTP de Playwright: localhost:5500
```

El proyecto emulado es `demo-fijas-vivo`; la configuración cliente en hostnames locales conecta Auth y Firestore a los emuladores. El SDK de Firebase utilizado por los módulos de navegador es la versión 10.14.1. No se usa Firebase Storage ni Cloud Functions. Los pagos y la autorización de suscripciones no existen en la implementación actual.

## Estructura del código

```text
src/
  views/       páginas HTML y controladores de cada vista
  components/  componentes compartidos de interfaz y autenticación
  services/    configuración Firebase, permisos y operaciones de negocio
  models/      validación y transformación de datos
  styles/      hojas fuente compartidas y específicas de las vistas
dist/          CSS generado para publicación
e2e/           specs, fixtures y helpers de Playwright
tests/         pruebas Node y utilidades de emulador
docs/          documentación de producto y desarrollo
```

Los nombres históricos de páginas en la raíz se conservan como alias de compatibilidad. Firebase Hosting los redirige a sus vistas semánticas en `src/views/`; el documento raíz `index.html` también reenvía al directorio público para los servidores estáticos locales.

## Componentes y flujo de datos

- **`src/views/public-tipsters.html` + `viewer-shell.js` y módulos relacionados:** directorio, perfiles, feeds Explorar/Siguiendo, presencia y comunidad asociada a pronósticos.
- **`src/views/tipster-access.html` + `tipster-view.js`:** punto de entrada de tipsters; carga el markup compartido de `tipster-workspace.html`.
- **`src/views/tipster-workspace.html`:** plantilla única y ruta independiente con comprobación de sesión para el espacio de trabajo del tipster.
- **`src/views/platform-owner.html`:** puerta de autenticación de creador; valida correo y permisos administrativos antes de transferir a la consola.
- **`src/views/operations-console.html` + `admin-dashboard.js`:** única interfaz de gestión administrativa, con módulos visibles según permisos RBAC.
- **`src/views/streaming-overlay.html`:** presentación pública de selecciones habilitadas para el widget de streaming.
- **Módulos de `src/`:** UI compartida en `components/`, lógica y conexión Firebase en `services/`, validación y transformación en `models/`, controladores y plantillas en `views/`.
- **Firestore:** almacena perfiles, pronósticos, seguimientos, presencia, solicitudes, datos privados de usuario y datos comunitarios.

Las lecturas y escrituras pasan por Firebase desde el navegador; las reglas de Firestore son la frontera de autorización. La identidad proviene de Firebase Authentication. La aprobación de tipster y los permisos administrativos se validan con datos autorizados fuera del registro público. Un campo de rol elegido en el cliente no debe conceder privilegios. Las operaciones que necesitan coherencia entre documentos usan transacciones de Firestore; las fechas autoritativas usan timestamps de servidor donde las reglas lo requieren.

Las publicaciones y perfiles incluyen información pública. Los datos financieros del tipster y otra información de cuenta se mantienen en rutas privadas según las reglas. La configuración publicada al navegador es de cliente y no constituye un lugar para secretos. Las reglas, su modelo de acceso y las excepciones deliberadas deben revisarse antes de cada cambio sensible.

## Tecnologías y estilos

- **HTML5 y JavaScript ES modules:** ejecución directa en navegador, sin build de JavaScript.
- **CSS:** hojas específicas para vistas y componentes, además de estilos compartidos.
- **Tailwind CSS 3.4:** `src/styles/styles.css` es la fuente para la hoja compilada a `dist/styles.min.css` mediante `build-css.js`, PostCSS y Autoprefixer. El artefacto generado está versionado y no se edita manualmente.
- **Firebase:** Authentication, Cloud Firestore y Hosting.
- **Herramientas de desarrollo:** Node.js, ESLint y Playwright.

No todas las páginas consumen el CSS compilado: `public-tipsters.html`, `tipster-access.html`, `tipster-workspace.html`, `platform-owner.html` y `operations-console.html` cargan `dist/styles.min.css`; el panel tipster comparte `src/styles/tipster-view.css`. Antes de una modificación visual, revisa las hojas enlazadas en la página afectada.

## Estándares UI/UX presentes

- Sistema visual oscuro con acentos esmeralda, superficies compartidas, estados de interacción y tipografía Plus Jakarta Sans.
- Diseños responsivos; por ejemplo, los canales y el mural del lector se adaptan a una disposición móvil.
- Foco visible y estructura semántica con encabezados, etiquetas, landmarks y mensajes de estado accesibles en las vistas principales.
- Uso de controles nativos como `dialog` y patrones de carga con skeletons y estados de error/espera.
- Microinteracciones breves para foco, hover, estado activo, paneles y transiciones; las superficies relevantes respetan `prefers-reduced-motion`.
- Los cambios de movimiento o interacción deben conservar la operación por teclado y no esconder información necesaria tras hover.

Estos patrones describen prácticas visibles en la implementación, no una declaración de conformidad WCAG ni una auditoría exhaustiva de accesibilidad.

## Seguridad y límites del sistema

- Los roles, aprobaciones y permisos no se conceden desde la interfaz; las reglas deben hacer cumplir cada operación.
- Mantener en el cliente solo configuración pública de Firebase; nunca añadir claves privadas, credenciales o secretos.
- Los datos de producción no se usan para pruebas. Los recorridos de integración se dirigen al proyecto emulado.
- No afirmar que la aprobación verifica el desempeño deportivo.
- Cualquier futura suscripción, contenido premium o pago debe diseñarse con autorización del lado servidor y una colección privada separada de las publicaciones públicas. El cliente actual no puede constituir por sí solo una frontera de pago.
- Las reglas locales pueden ser más recientes que las reglas desplegadas. La presencia de código no demuestra que una función esté disponible en producción.

## Estrategia de pruebas

### ESLint

`npm run lint` ejecuta ESLint sobre JavaScript y HTML de la raíz y `src/`. Las pruebas de `e2e/` y `tests/` se ejecutan con sus runners respectivos.

### Playwright

Los specs viven en `e2e/`, con utilidades y fixtures en `e2e/helpers/`. Hay pruebas de recorridos, interfaz y controles, reglas/roles, comunidad y reportes, widget OBS, espacio de tipster e informes de bankroll. Algunas verificaciones unitarias de lógica pura usan el test runner de Node en `tests/`.

- `npm run test:visual` ejecuta tres specs visuales en Chromium con navegador visible y un worker.
- `npm run test:visual:seeded` ejecuta el recorrido visual con fixtures, en el proyecto de Playwright correspondiente.
- `npx playwright test --config=playwright.config.js` ejecuta el conjunto configurado para Chromium, Firefox y WebKit; necesita Auth y Firestore emulados activos y levanta/reutiliza el servidor HTTP local.
- `npm run seed` prepara cuentas y datos de prueba en emuladores y limpia datos previos. Usarlo solo cuando se quiera reinicializar el entorno local.

La configuración general excluye algunos specs del conjunto por defecto; consulta `testIgnore` en `playwright.config.js` y la configuración específica antes de asumir que un comando los incluye. No se afirma que todo el conjunto esté pasando ahora: los resultados dependen del código y del estado de los emuladores cuando se ejecuten.

## Mantenibilidad y cambios

- Separar lógica de dominio de la vista cuando ya exista un módulo para esa responsabilidad; buscar y reutilizar helpers antes de introducir duplicados.
- Cambiar reglas con pruebas en emulador y revisión de seguridad; no mover la decisión de autorización a JavaScript de interfaz.
- Si se cambian `src/styles/styles.css` o clases Tailwind de `src/`, ejecutar `npm run build:css` y revisar el diff de `dist/styles.min.css`.
- Mantener los fixtures aislados y limpiar solo los documentos que creó cada prueba.
- Actualizar esta documentación cuando cambien capacidades, stack, comandos o límites operativos.
