# Firestore rules emulator tests

## Bankroll privado

- Orden del panel: creación de pronósticos, resumen financiero privado y tabla Mis pronósticos. Los filtros se expanden desde «Filtros del historial» y conservan sus valores al cerrarse. Menús/notas compactos usan transiciones CSS de 160 ms al abrir con puntero; teclado y movimiento reducido evitan el desplazamiento animado.

- `picks/{pickId}` permanece público y no acepta campos financieros.
- `picks/{pickId}/private/bankroll` contiene `stakeAmount`, `stakeMinorUnits` (entero en céntimos), `currency`, `created_at` y `updated_at`. Solo su dueño puede acceder mediante el SDK cliente; no hay excepción para el creador. Los administradores del proyecto con acceso privilegiado a Firebase siguen pudiendo consultar los datos.
- El resultado se obtiene de `picks.estado`; no se duplica en el registro financiero. `cash_out` representa un cierre anticipado total y requiere `returnAmount` y `returnMinorUnits` privados. Estado y retorno cambian atómicamente; volver a otro resultado elimina los campos de retorno. No se permiten retiros parciales.
- El dashboard privado resume todos los picks del período por moneda: importe pendiente en riesgo, retornos cerrados, profit neto y Yield. Ganadas usan `round(stakeMinorUnits * cuota)`; perdidas retornan cero; anuladas devuelven el stake; cash out usa el retorno registrado. Yield = profit / stake de picks cerrados × 100, excluyendo pendientes y anuladas del denominador, incluyendo cash out. Sin stake cerrado, Yield no está definido. No es un saldo bancario, no contempla comisiones ni conversiones y los retornos normales son teóricos según cuota.
- El período inicial es del día 1 del mes hasta hoy, ambos incluidos en zona horaria local, usando `fecha_evento` (no fecha de publicación ni un timestamp de liquidación). Rango personalizado Desde/Hasta; filtros combinables por estado, deporte y casa. «Cashback» filtra `cash_out`, no representa un nuevo modelo.
- Firestore consulta por `user_id` y rango `fecha_evento >= inicio / < día posterior a Hasta`, orden descendente. Descubre el historial en lotes de 100 con cursores y mantiene intervalos de cursores fijos con listeners en tiempo real; las inserciones no desplazan picks fuera de las páginas. Registros privados se sincronizan solo para los picks del período. La tabla pagina 50 filas, pero totales y CSV incluyen todo el resultado filtrado, sin el antiguo límite de 50. Cambiar período o sesión cancela listeners anteriores; carga o errores bloquean totales y exportaciones parciales.
- Exportar CSV (compatible con Excel, UTF-8 BOM) incluye filtros, resumen por moneda y detalle financiero de todos los picks filtrados; Descargar resumen CSV omite el detalle. Picks sin importe mantienen columnas financieras vacías y no contribuyen al resumen. Se escapan comillas, saltos de línea y texto que pueda interpretarse como fórmula. Ambos archivos son privados y se generan localmente, sin guardar reportes en Firestore.
- Exportar Resumen en PDF genera un documento ejecutivo A4, con tipster, fecha de emisión, rango/filtros, total de picks, efectividad global y Profit/Yield separados por moneda. Efectividad = ganadas / (ganadas + perdidas), sin pendientes, anuladas ni Cash out; incluye picks sin registro privado. No se calcula Yield entre monedas. Sin base de cálculo se indica explícitamente. El CSV y PDF comparten selección de fechas inclusivas y filtros con `bankrollReportData`; no dependen de la página visible.
- El botón «Exportar Resumen en PDF» abre una pestaña local con una plantilla HTML y CSS embebido y solicita el diálogo de impresión. Elegir «Guardar como PDF», A4, activar gráficos de fondo y desactivar cabeceras/pies del navegador. Si se cancela, el botón «Imprimir / Guardar como PDF» permite reabrir el diálogo. No hay descarga automática ni dependencia jsPDF; todos los datos permanecen locales. Permitir ventanas emergentes: si se bloquean, el panel muestra un error.
- Diseño alineado con el dashboard: zinc oscuro, marca F. en emerald, tarjetas con bordes finos, rejillas CSS para filtros, rendimiento y balances. Profit/Yield destacados y negativos en rosa, cada etiqueta y valor separados. CSS de impresión usa un espaciador de tabla repetido de 34 mm para reservar el footer fijo de metodología y privacidad en cada página, dentro del área imprimible, evita dividir tarjetas y mantiene texto seleccionable. La vista previa adapta las columnas en móvil.
- Cabecera y filtros truncan valores largos con puntos suspensivos (valor completo en `title` en la vista previa). La tabla exterior usa ancho fijo; las celdas de rejilla permiten encogerse y las cifras se ajustan con saltos de línea sin truncar importes. E2E comprueba límites de celdas y texto en escritorio, móvil e impresión con nombres extensos y sin espacios.
- La prueba E2E Chromium intercepta únicamente `window.print` para no abrir un diálogo del sistema; verifica la pestaña, filtros, conteos, impresión automática/reintento y ausencia de desbordamiento móvil. Genera el PDF real con el motor de impresión de Chromium (`page.pdf`, estilos de impresión, fondos y A4), comprueba texto seleccionable con PDF.js y renderiza las páginas mediante canvas. PDF.js/canvas son solo dependencias de desarrollo.
- Ejecutar `npx playwright test bankroll-reports.spec.js --project=chromium --workers=1`. Requiere emuladores y cuenta `tipster@test.local` existentes; crea 110 picks temporales con 105 coincidencias y exporta desde la tercera página. Elimina exclusivamente sus fixtures; no reinicia otros datos ni usa producción. Las pruebas unitarias se ejecutan con `node --test tests/bankroll.test.js`.
- Las pruebas guardan `reports/chromium/detalle.csv`, `resumen.csv`, `resumen.html`, `resumen.pdf` y `resumen-pagina-N.png`. Abrir el HTML desde `http://localhost:5500/reports/chromium/resumen.html` para inspeccionar la plantilla o el PDF en un visor local. Se reemplazan en la siguiente ejecución y no se eliminan con los fixtures. Directorios excluidos de Git y Hosting; el servidor local sí los sirve: no exponerlo a Internet. En uso normal, el usuario elige dónde guardar el PDF; una web no escribe arbitrariamente en el workspace.
- Mis pronósticos muestra una fila por pick con columnas independientes: evento, selección, deporte, fecha/hora del evento, casa de apuestas, confianza, resultado, importes privados y Yield individual (profit / stake × 100; sin valor para pendientes/anuladas o sin importe privado). La nota se consulta mediante «Ver nota» bajo la selección, en un popover sin columna adicional. Un botón de tres puntos abre las acciones en otro popover sobre la tabla, identificado por evento y selección: editar, cambiar estado/anular, cierre anticipado con retorno privado y eliminación. Los formularios se expanden dentro del popover; clic fuera o Escape lo cierran. La selección «En stream» está separada en la columna Widget OBS y controla qué picks lee el widget. Cash out no equivale a cashback ni a anulación. En pantallas estrechas solo las tablas se desplazan horizontalmente.
- El perfil público y OBS solo muestran «Cierre anticipado», nunca los importes. Los cash out se excluyen del porcentaje de aciertos (solo ganadas/perdidas).
- La creación y edición guardan ambos documentos en una transacción. Vaciar el importe al editar elimina el registro privado; borrar el pick elimina ambos de forma atómica.
- Las monedas iniciales son PEN, USD y EUR. Para ampliar monedas, actualizar `bankroll.js` y la lista permitida de `validBankroll` en `firestore.rules`. Para monedas con distinta precisión, adaptar también el divisor de unidades menores en las reglas y los atributos `min`/`step` del input.
- Antes de usarlo en producción, publicar reglas e índices junto con el frontend: el índice compuesto `picks(user_id ASC, fecha_evento DESC)` está definido en `firestore.indexes.json`. Esperar a que esté listo; no se sustituye un fallo de índice por un reporte parcial. Si las reglas antiguas rechazan el documento privado, no se crea el pick público.
- Validación del parser: `node --test tests/bankroll.test.js`. La suite de reglas incluye privacidad frente a anónimos, otros tipsters y creadores, validación, rollback y borrado atómico. La suite reinicia datos de los emuladores; nunca ejecutarla contra producción.

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
