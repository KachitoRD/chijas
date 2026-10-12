# Fijas en vivo

Plataforma web para descubrir tipsters aprobados, consultar pronósticos públicos, seguir perfiles y conversar alrededor de cada publicación. El proyecto usa HTML5, JavaScript con módulos ES, CSS/Tailwind y Firebase Authentication, Cloud Firestore y Hosting.

## Documentación

- [Resumen ejecutivo](docs/EXECUTIVE_SUMMARY.md)
- [Guion de pitch](docs/PITCH_DECK_OUTLINE.md)
- [Guía de usuario](docs/USER_GUIDE.md)
- [Arquitectura y calidad](docs/ARCHITECTURE_&_QUALITY.md)
- [Contribuir al proyecto](docs/CONTRIBUTING.md)

## Código fuente

- `src/views/` — páginas semánticas y controladores de vista.
- `src/components/` — UI compartida y notificaciones.
- `src/services/` — Firebase, permisos y operaciones de negocio.
- `src/models/` — esquemas, validaciones y transformaciones.
- `src/styles/` — hojas CSS fuente; `dist/styles.min.css` es generado.

Las páginas y módulos con nombres históricos en la raíz se mantienen como aliases de compatibilidad. Las páginas canónicas viven en `src/views/`.

## Desarrollo

- `npm run lint` — ESLint para JavaScript y HTML.
- `npm run build:css` — genera `dist/styles.min.css` desde `src/styles/styles.css`.
- `npm run test:visual` — pruebas visuales configuradas para Chromium.
- `npm run test:visual:seeded` — recorrido visual con datos de prueba en emuladores.
- `npx playwright test --config=playwright.config.js` — conjunto Playwright predeterminado; requiere Auth y Firestore Emulators.

Las pruebas se ejecutan contra el proyecto emulado `demo-fijas-vivo`, nunca contra datos de producción. Antes de `npm run dev` o `npm run seed`, revisa las advertencias sobre los puertos y la limpieza de datos en [Contribuir](docs/CONTRIBUTING.md).

## Alcance actual

La aplicación no tiene pagos, suscripciones activas ni API propia. La aprobación de un tipster permite publicar, pero no certifica resultados ni garantiza ganancias. Consulta [Arquitectura y calidad](docs/ARCHITECTURE_&_QUALITY.md) para límites y detalles técnicos.
