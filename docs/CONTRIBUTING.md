# Contribuir a Fijas en vivo

**Actualizado: 11 de octubre de 2026**

Esta guía describe cómo proponer cambios sin romper el modelo de acceso, las pruebas de emulador ni la experiencia visual existente.

## Estructura del repositorio

- **`src/views/`:** vistas HTML semánticas y sus controladores; por ejemplo `public-tipsters.html`, `tipster-access.html`, `tipster-workspace.html`, `platform-owner.html`, `operations-console.html` y `streaming-overlay.html`. `platform-owner.html` solo autentica al creador y deriva al centro administrativo común; no contiene una segunda consola.
- **`src/components/`:** UI compartida, controles de autenticación, feedback y notificaciones.
- **`src/services/`:** configuración Firebase, permisos y servicios de operaciones.
- **`src/models/`:** validadores y transformaciones de datos independientes de la vista.
- **`src/styles/`:** hoja fuente Tailwind (`styles.css`), estilos compartidos y hojas específicas.
- **Archivos de página en la raíz:** alias históricos para compatibilidad; las rutas canónicas son las vistas de `src/views/`.
- **Módulos y hojas CSS en la raíz:** puentes de compatibilidad para importadores antiguos; el código fuente real vive bajo `src/`.
- **`dist/styles.min.css`:** resultado generado de Tailwind para publicación; nunca editarlo directamente.
- **`e2e/`:** specs Playwright y fixtures/helpers.
- **`tests/`:** pruebas unitarias o de reglas y utilidades de preparación de datos.
- **`scripts/`:** scripts de desarrollo.
- **`docs/`:** documentación de producto, usuario, arquitectura y contribución. Esta carpeta no se publica en Firebase Hosting.

Antes de crear un archivo o helper, busca patrones existentes y confirma qué HTML carga el módulo y las hojas correspondientes.

## Convenciones de código

- Mantener HTML5 y módulos ES; JavaScript se sirve sin compilación.
- Seguir las responsabilidades y nombres ya utilizados por el módulo afectado; no añadir un framework o dependencia para resolver una tarea acotada.
- Preferir elementos HTML semánticos, etiquetas asociadas a los controles, botones con tipo explícito y mensajes de estado accesibles.
- Mantener errores visibles y tratar explícitamente estados de carga, vacío, error y falta de permisos. No sustituir fallos por datos vacíos como si la operación hubiera tenido éxito.
- Los valores de permisos y estado administrativo no se aceptan desde el cliente como fuente de autoridad. Las reglas de Firestore son parte de la interfaz de seguridad.
- Usar timestamps del servidor y transacciones cuando el modelo y las reglas los requieran. Los pronósticos públicos no deben adquirir campos financieros privados.
- No añadir secretos al repositorio. La configuración web de Firebase es pública por diseño; no debe confundirse con una credencial secreta.
- Respetar idioma y tono existentes en cada superficie, incluidos los textos de error y consentimiento.

## Calidad visual y accesibilidad

- Reutilizar los estilos, tokens y controles compartidos existentes antes de definir variantes nuevas.
- Conservar el sistema visual oscuro/esmeralda, contraste suficiente, jerarquía tipográfica clara y espaciado consistente.
- Comprobar estados normal, hover, active, focus-visible, disabled, loading y error; no depender únicamente del color para comunicar estado.
- Verificar teclado, foco, etiquetas y semántica de diálogos. Los tooltips o ayudas deben poder descubrirse con teclado y táctil cuando corresponda.
- Mantener diseños utilizables en móvil y escritorio; las tablas pueden tener desplazamiento local, pero la página no debe desbordarse horizontalmente sin intención.
- Respetar `prefers-reduced-motion`; usar animaciones breves y no animar información esencial.
- Si se cambia `src/styles/styles.css` o se agregan clases Tailwind en `src/`, ejecutar `npm run build:css` y confirmar que el artefacto generado coincide con el cambio. No editar `dist/styles.min.css` a mano.

## Desarrollo local y verificación

Node.js y las dependencias ya declaradas en `package.json` son necesarios. No hace falta compilar JavaScript.

1. Usa Auth y Firestore Emulators con el proyecto `demo-fijas-vivo`; los puertos configurados son 9099 y 8080. La interfaz de emuladores utiliza el puerto 4000.
2. Sirve el sitio por HTTP local. Playwright configura `http://localhost:5500`; no abras las páginas con `file://`.
3. Antes de usar `npm run dev`, ten en cuenta que el script libera procesos de los puertos 4000, 4400, 4500, 8080 y 9099. `npm run seed` limpia datos previos del entorno emulado y crea fixtures. No uses esos comandos si el estado existente debe conservarse.
4. Ejecuta `npm run lint` para el análisis estático.
5. Para cambios visuales, `npm run test:visual` ejecuta las pruebas visuales Chromium configuradas.
6. Para el recorrido visual sembrado, usa `npm run test:visual:seeded` solo contra los emuladores.
7. Para el conjunto Playwright predeterminado, ejecuta `npx playwright test --config=playwright.config.js` con los emuladores activos. Revisa la configuración porque algunos specs se excluyen del conjunto general o tienen su propia configuración.
8. Ejecuta las pruebas unitarias relacionadas con la lógica tocada, por ejemplo `node --test tests/pick-schema.test.js tests/project-layout.test.js`. Para reglas, usa las pruebas preparadas para emuladores; no uses datos de producción.

No arranques emuladores ni ejecutes operaciones contra proyectos reales como parte de una prueba local sin autorización del responsable del entorno.

## Pull requests

1. Trabaja en una rama enfocada y mantén el cambio acotado a una tarea.
2. Incluye pruebas para la lógica nueva o afectada; para cambios visuales, añade o actualiza el spec de UI adecuado cuando sea viable.
3. En la descripción del PR explica el problema, la solución, los riesgos de permisos/datos y los comandos ejecutados con sus resultados reales.
4. Adjunta capturas de escritorio y móvil para cambios perceptibles de interfaz, evitando datos privados.
5. Revisa el diff para descartar artefactos, documentos antiguos, cambios generados inesperados o información sensible.
6. Solicita revisión antes de integrar. No declares una prueba aprobada si dependía de emuladores ausentes o si no se ejecutó.

## Reglas, despliegues y documentación

- Un cambio a `firestore.rules` exige revisar el modelo completo, actualizar pruebas del emulador y obtener revisión de seguridad. La lectura pública de perfiles aprobados, pronósticos y otras superficies declaradas por diseño no debe cerrarse por conveniencia sin una decisión de producto.
- Las pruebas deben usar exclusivamente `demo-fijas-vivo`; no apuntar a `chijas` ni a datos reales.
- El workflow existente se dispara con cambios en `main`, compila CSS y publica Hosting en `demo-fijas-vivo`. No ejecuta la suite de pruebas antes del deploy. Por tanto, integrar a `main` tiene efecto operativo y debe seguir el proceso de aprobación del proyecto.
- El despliegue manual de reglas, índices o Hosting requiere autorización explícita del responsable; no forma parte de la verificación rutinaria del PR.
- Actualiza los documentos de `docs/` si cambia una función, un comando o un límite relevante del sistema. El documento de arquitectura debe diferenciar lo implementado de lo planificado.
