# Plan de implementación del centro de control administrativo

> **Para agentes de implementación:** ejecutar este plan por fases verificables y no iniciar la fase financiera real hasta aprobar su modelo de negocio y seguridad.

**Objetivo:** Convertir el panel administrativo en un centro de operación claro, rápido y auditable, preparado para un modelo futuro de revenue share y membresías sin presentar como reales ingresos que aún no se cobran.

**Arquitectura:** Mantener la SPA estática y sus módulos JavaScript actuales para vistas y lecturas autorizadas. La interfaz nunca será autoridad para permisos, entitlement premium ni movimientos de dinero. La monetización futura se basará en pagos de suscripciones/accesos premium, eventos contables de servidor y liquidaciones idempotentes a tipsters; nunca en el stake de los picks.

**Stack:** HTML5, módulos ES, Firebase Auth y Firestore SDK 10.14.1, Firestore Rules, Tailwind CSS 3.4, CSS propio, ESLint y Playwright.

**Especificación:** Solicitudes del usuario del 2026-10-08 para planear el dashboard administrativo y prepararlo para revenue share, suscripciones, picks premium y comunidades VIP.

## Restricciones globales

- Preservar los permisos y esquemas existentes; no modificar `firestore.rules` sin avisar y someter los cambios a revisión de seguridad.
- El proyecto no tiene servidor API ni proveedor de pagos conectado. No representar unidades de picks como dinero, GGR, ingreso, saldo o pago.
- El modelo objetivo contempla comisiones porcentuales configurables, suscripciones/membresías, acceso PPV/VIP a picks y salas/chats, y cierres quincenales o mensuales; aún no autoriza cobros reales.
- Los picks premium deben residir en una colección separada de la vitrina pública y su lectura debe protegerse en Firestore Rules, no solo ocultarse en la interfaz.
- El cliente no concede roles ni escribe permisos, estados financieros o movimientos privilegiados.
- No usar datos de producción en pruebas; las pruebas Firebase deben usar `demo-fijas-vivo` y emuladores ya activos.
- Si cambia `styles.css` o clases Tailwind de HTML/JS, ejecutar `npm run build:css` y verificar `dist/styles.min.css`.
- No desplegar, cambiar el proyecto Firebase, instalar dependencias ni hacer commits sin autorización explícita.
- Mantener las superficies HTML/JS actuales y los módulos ES; evitar migraciones de framework o dependencias no necesarias.

## Archivos y responsabilidades previstas

- `admin-dashboard.html`: estructura de navegación, portada, filtros, tablas y estados de cada módulo.
- `admin-dashboard.js`: montaje SPA, consultas, filtros, estados de carga/error, navegación contextual y acciones de interfaz.
- `admin-services.js`: operaciones administrativas ya soportadas por transacciones cliente y Firestore Rules; no añadir autoridad financiera aquí.
- `admin-finance.js`: agregados editoriales de unidades públicas y, solo tras definir contabilidad, funciones puras de presentación/cálculo financiero.
- `admin-view.css`, `styles.css`, `dist/styles.min.css`: estilo responsive y build publicado de CSS.
- `firestore.rules`: lectura/escritura permitidas; se toca únicamente con aviso previo y revisión de seguridad.
- `tests/admin-finance.test.js`, `e2e/admin-core.spec.js`: cálculos puros y recorridos en emuladores.
- Futuro, condicionado a decisión de arquitectura: módulos de suscripción, catálogo/entitlements, picks premium y salas VIP; funciones de servidor para pagos, webhooks, contabilidad, liquidaciones y auditoría. Ubicación y runtime se definirán en especificaciones aparte.

## Fases de implementación

### Fase 0 — Decisiones de negocio, datos y permisos

1. Inventariar cada KPI y acción del panel, asignando fuente, permiso, propietario, retención y comportamiento ante falta de datos.
2. Confirmar la base del `takeRate`: ingresos efectivamente cobrados por suscripciones, PPV/VIP de picks o acceso a salas/chats; excluir stake, premios y dinero apostado. Definir si comisiones del proveedor, impuestos, reembolsos y contracargos se restan antes o después del reparto.
3. Definir el ciclo de comisión: porcentaje por tipster y producto, vigencia efectiva, valor base configurable (por ejemplo, 70/30), moneda, precisión, redondeo, mínimos, reservas y ajustes. No cambiar retroactivamente ventas cerradas cuando se actualiza el porcentaje.
4. Elegir proveedor(es) de pago y decidir qué sistema es autoritativo ante eventos asíncronos; especificar claves idempotentes, referencias externas, verificación de webhook, reintentos, conciliación y tratamiento de pagos duplicados/fuera de orden.
5. Elegir periodicidad inicial de liquidación (quincenal o mensual), zona horaria, hora de corte, retrasos/hold, responsable de aprobación y mecanismo de pago al tipster.
6. Definir productos y entitlements: suscripción recurrente, compra PPV con o sin vencimiento, acceso a sala/chat VIP, cancelación, renovación, expiración, reembolso y revocación. Precisar el criterio Trust Score como política editorial independiente; no habilitar ni prometer elegibilidad automática hasta definir fórmula, fuente, umbral y revisión.
7. Aprobar matriz RBAC para `super_admin`, `admin` y roles operativos: lectura, preparación, aprobación, ejecución de pago y auditoría deben ser permisos distintos cuando aplique.
8. Entregable: decisiones aprobadas, diccionario de métricas, estados y transiciones. Hasta elegir proveedor y habilitar backend, Finanzas muestra solo configuración y los productos premium quedan inactivos.

**Puerta de salida:** ninguna tarjeta o tabla se denomina “ingreso”, “GGR”, “flujo de caja”, “saldo” o “pagado” si no existe una fuente verificable para ese concepto. El Trust Score no concede ni retira acceso pagado hasta contar con definición editorial aprobada.

### Fase 1 — Información de arquitectura y UX del panel

1. Reorganizar la navegación en áreas reconocibles: Resumen, Operación (tipsters/perfiles/viewers), Finanzas, Moderación y Gobierno; ocultar áreas sin permiso.
2. Diseñar una portada orientada a tareas: pendientes por antigüedad, alertas con severidad y siguiente acción, estado de datos y accesos directos a la cola correspondiente.
3. Consolidar encabezados, filtros, tablas y acciones en patrones comunes. Mantener búsqueda, filtros y orden al cambiar de pestaña y volver; incluir “limpiar filtros”.
4. Definir densidad de escritorio y adaptación tablet/móvil: sidebar colapsable o navegación compacta, tablas con scroll controlado y acciones esenciales accesibles sin hover.
5. Mantener identidad Emerald Dark/Glass, mejorando contraste, jerarquía tipográfica y legibilidad de datos; reservar color para estado, prioridad y acción. Añadir estados vacíos, cargando, parcial, error recuperable y datos desactualizados.
6. Añadir accesibilidad de teclado y lector de pantalla: foco visible, encabezados de tabla, nombres accesibles, anuncios de resultado y confirmaciones para acciones destructivas.

**Verificación:** inspección visual escritorio/tablet/móvil y pruebas Playwright de navegación por teclado, ausencia de desbordes y persistencia de filtros.

### Fase 2 — Centro operativo confiable

1. Separar las consultas por módulo y permiso, usando consultas Firestore compatibles con Rules e índices declarados; añadir límites/paginación donde el tamaño de colección lo requiera.
2. Mejorar bandejas actuales para solicitudes de tipster y cambios de perfil: filtros por estado/edad, búsqueda, apertura directa del caso, comparación de cambios y motivo obligatorio para rechazar.
3. En directorio de tipsters y viewers, mostrar estados sustentados por los datos disponibles; ofrecer filtros explícitos y confirmación antes de moderar.
4. Añadir estado de última actualización, error por fuente y reintento localizado. No convertir errores o campos faltantes en cero ni ocultar fallos parciales detrás de un “éxito”.
5. Evitar acciones duplicadas, reflejar el resultado de transacciones y conservar el contexto/foco al volver a la lista.

**Pruebas:** añadir cobertura de colas vacías, timestamps ausentes, falla de un listener, reintento, filtros sin resultados, permiso insuficiente y doble clic sobre una acción.

### Fase 3 — Resumen ejecutivo y analítica editorial

1. Definir rangos inequívocos (hoy, 7 días, 30 días, rango personalizado), zona horaria y si cada serie agrupa por creación, cierre u otro evento.
2. Separar tarjetas de actividad editorial (picks publicados, pendientes, resueltos, win rate) de métricas de audiencia/presencia y de Finanzas.
3. Etiquetar stake y resultado como unidades públicas declaradas; explicar exclusiones y datos incompletos. No sumar escalas distintas entre tipsters como volumen monetario.
4. Permitir abrir el detalle que explica cada agregado; mantener consistencia entre filtros, tarjetas y gráficos.
5. Determinar la estrategia para colecciones grandes: consultas agregadas/materializadas del lado servidor o límites claros del conjunto analizado; no descargar una colección ilimitada al navegador.

**Pruebas:** límites inclusivos/exclusivos de fechas, cambios de zona horaria, pick sin fecha/stake, pick pendiente/void/cashout, perfiles sin presencia y consistencia entre total y detalle.

### Fase 4 — Ledger y liquidaciones de revenue share, solo después de aprobar Fase 0

1. Especificar una fuente contable autoritativa y un modelo append-only de eventos monetarios por suscripción, PPV o VIP: importes en unidades menores enteras, moneda explícita, producto, tipster, periodo cubierto, timestamp de servidor, clave idempotente y referencia al proveedor.
2. Definir separación de conceptos: pagos capturados, reembolsos/contracargos, comisión del proveedor, ingreso bruto/neto de la plataforma y devengado del tipster. No llamar GGR al ingreso de suscripciones.
3. Calcular share según la tasa vigente en el momento/periodo de la venta; guardar la versión aplicada, base, tasas, redondeo y desglose del cálculo como evidencia inmutable.
4. Diseñar ciclos quincenales o mensuales configurables, con cierre de periodo reproducible, protección contra duplicados, ajustes rastreables y estados `pendiente`, `procesando`, `pagado`; cubrir además `fallido`, `retenido` y `revertido` para no perder estados de excepción.
5. Implementar cierres, transiciones y pagos exclusivamente en backend autenticado/autorizado. Aplicar validación, idempotencia, auditoría, verificación de webhooks y conciliación; Firestore Rules deben impedir escrituras directas del cliente a ledger/liquidaciones.
6. En UI, ofrecer periodo, fecha de corte y moneda visibles; desglose por tipster, producto y evento; detalle de share; filtros por estado; evidencia de pago y conciliación. Separar preparar, aprobar y marcar/confirmar pago según permisos.
7. Versionar el `takeRate` con porcentaje, producto, vigencia y autor. El documento actual solo guarda el porcentaje vigente; no reutilizarlo como historial ni reescribir liquidaciones cerradas.

**Puerta de salida:** modelo revisado por seguridad y negocio, Rules revisadas, pruebas de idempotencia/reintento/reembolso/contracargo/doble aprobación y cierre repetible, sandbox del proveedor y conciliación de muestra demostrable. No habilitar cobros o pagos reales antes de completar estas condiciones.

### Fase 5 — Suscripciones, productos premium y entitlements

1. Modelar productos publicables por tipster: membresía recurrente, acceso PPV a picks y membresía/acceso a sala o chat VIP; cada oferta debe tener precio/moneda, estado, condiciones, periodo y propietario.
2. Crear el flujo de checkout a través del proveedor escogido, manteniendo datos de tarjeta/token de pago fuera de Firestore. El servidor verifica eventos del proveedor antes de conceder o revocar un entitlement.
3. Mantener colecciones separadas para contenido premium, compras/suscripciones y entitlements del usuario. Resolver acceso por UID, producto/contenido, estado y ventana temporal; Rules/backend son la autoridad y deniegan por defecto.
4. Implementar cancelación al final del ciclo, expiración, renovación, fallo de cobro, reembolso y contracargo con transición coherente del entitlement y efecto trazable en ledger/liquidación.
5. Para moderación de salas/chats VIP, aplicar el entitlement al canal y a cada lectura/escritura, sin filtrar mensajes premium mediante feeds o listeners públicos.
6. Diseñar experiencia viewer/tipster: oferta y condiciones, confirmación de compra, estado de membresía, acceso/bloqueo comprensible, administrar/cancelar suscripción y vista del tipster con miembros e ingresos reconciliados.
7. Integrar Trust Score únicamente como criterio de elegibilidad si su fórmula, ventana, umbral, protección ante manipulación y proceso de apelación están definidos y revisados; mostrar el criterio al tipster sin exponer señales privadas antifraude.

**Pruebas:** acceso permitido a suscripción vigente y denegado a usuario sin entitlement, expirado, cancelado o reembolsado; evento duplicado/fuera de orden; intento de leer premium desde feed público; aislamiento entre salas; y usuarios viewer que nunca puedan autoconcederse entitlement.

**Puerta de salida:** pruebas de acceso directo por SDK contra emuladores, reglas verificadas, sandbox de pagos y pruebas de ciclo completo desde compra hasta revocación/refund antes de activar productos.

### Fase 6 — Auditoría, riesgo y gobierno

1. Registrar de forma inmutable acciones sensibles: cambios de perfil/rol/take rate, moderación, decisiones de solicitudes, entitlement y transiciones financieras. Incluir actor, objeto, acción, fecha de servidor, motivo y correlación; evitar copiar datos personales innecesarios.
2. Construir búsqueda de auditoría con filtros por actor, acción, objetivo y fecha, respetando permisos; permitir revisar el antes/después según clasificación de datos.
3. Mantener las herramientas de gobierno y límites exclusivamente para `super_admin`; mostrar a `admin` la razón comprensible de cada restricción.
4. No implementar “ajustes manuales de saldo” ni suspensión por riesgo sin modelo, permisos, razón obligatoria y flujo de doble control aprobados.

**Pruebas:** acceso denegado a roles no autorizados, evento de auditoría ante cambios válidos, evento no falsificable desde cliente, y conservación del historial ante modificación concurrente.

### Fase 7 — Aceptación y puesta en servicio

1. Ejecutar `npm run lint`, pruebas unitarias relevantes y E2E Chromium/Firefox/WebKit aplicables contra emuladores; no iniciar emuladores si no están activos.
2. Ejecutar `npm run build:css` si corresponde y revisar `git diff --check`.
3. Completar walkthrough de roles viewer-admin, admin operativo y super_admin; comprobar escritorio y viewport móvil, errores, vacíos y navegación de retorno.
4. Revisar índices, Rules, rendimiento de listeners, costos potenciales de lecturas y registros de auditoría antes de solicitar autorización independiente para desplegar.

## Criterios de aceptación del dashboard

- Cada cifra tiene definición, unidad, periodo, fuente y estado de actualización visibles o accesibles.
- Ningún error de carga se presenta como cero ni una unidad declarada como dinero real.
- Las acciones disponibles corresponden al permiso efectivo; Firestore/servidor, no la UI, impone autoridad.
- Los flujos frecuentes se completan sin perder filtros, selección ni posición contextual al revisar varios registros.
- Las vistas son operables por teclado y legibles en escritorio, tablet y móvil.
- Las operaciones críticas producen evidencia de auditoría y resultado recuperable ante fallo o concurrencia.
- El módulo financiero no anuncia pagos, GGR o saldos antes de contar con ledger, backend y conciliación.
- Ningún usuario accede a picks, salas o chats premium mediante una ruta directa si carece de un entitlement vigente.
- Cada liquidación se puede reconstruir desde eventos fuente y su `takeRate` versionado; reintentar un cierre o webhook no duplica importes ni pagos.

## Revisión de cobertura y riesgos

- **Cobertura:** experiencia visual y navegación (Fase 1), operaciones (Fase 2), analítica editorial (Fase 3), revenue share/ledger/liquidaciones (Fase 4), suscripciones y contenido premium (Fase 5), auditoría/RBAC (Fase 6) y verificación (Fase 7).
- **Riesgos prioritarios:** unidades heterogéneas interpretadas como moneda; doble conteo o doble pago; entitlement concedido desde cliente o no revocado; contenido premium expuesto por consultas públicas; consultas incompatibles con Rules; roles que ven datos de más; información parcial mostrada como completa.
- **Descomposición recomendada:** redactar especificaciones pequeñas separadas para (a) UX/operación, (b) analítica editorial y (c) monetización/backend (ledger, proveedor, revenue share, suscripciones y entitlement). El subsistema de monetización requiere modelo de amenazas y revisión de Rules/seguridad antes de implementarse; no debe bloquear mejoras visuales/operativas seguras.
