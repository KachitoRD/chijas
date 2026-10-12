# Fijas en vivo — Resumen ejecutivo

**Documento para presentaciones ejecutivas e inversionistas**
**Actualizado: 11 de octubre de 2026**

## Visión

Fijas en vivo reúne en una sola experiencia el descubrimiento de tipsters, sus pronósticos públicos, el seguimiento de resultados y la conversación alrededor de cada publicación. La plataforma busca que una audiencia pueda encontrar creadores que le interesen y consultar su actividad publicada, mientras cada tipster dispone de herramientas para construir y mantener su presencia digital.

## Concepto y propuesta de valor

La propuesta combina un directorio abierto de tipsters aprobados manualmente con pronósticos atribuibles a perfiles, seguimiento personalizado y herramientas para compartir selecciones en transmisiones. A diferencia de un flujo aislado de mensajes o publicaciones sociales, el producto conecta perfil, actividad, resultados, comunidad por pronóstico y una vista compatible con software de streaming.

La aprobación habilita a publicar en la plataforma; no equivale a una certificación independiente de habilidad, rentabilidad o exactitud. Los pronósticos no garantizan resultados ni constituyen asesoramiento financiero.

## Problema y usuarios objetivo

La información de pronósticos suele estar dispersa entre canales y publicaciones, lo que dificulta descubrir autores, volver a consultar su historial y distinguir lo publicado por cada perfil. Los tipsters, por su parte, necesitan presentar su actividad de forma coherente y compartir selecciones en sus canales.

Los segmentos principales son:

- **Lectores y seguidores:** personas adultas que buscan perfiles, pronósticos y resultados públicos, y quieren organizar un feed según a quién siguen.
- **Tipsters:** creadores que solicitan acceso para publicar pronósticos, mantener su perfil, revisar su historial y mostrar selecciones en streaming.
- **Streamers:** tipsters o aliados que quieren presentar pronósticos seleccionados como una fuente de navegador en OBS o software compatible.
- **Operación de la plataforma:** equipo que revisa solicitudes de tipster y, con permisos específicos, administra perfiles y reportes de la comunidad.

## Producto y diferenciadores

- **Descubrimiento conectado:** perfiles, secciones Explorar y Siguiendo, presencia en la plataforma y un feed público en tiempo real. Los filtros de deporte están disponibles en el feed y los perfiles.
- **Actividad atribuible:** pronósticos públicos asociados a perfiles aprobados, con estado y resultados que facilitan revisar la actividad publicada. La aprobación es de acceso, no una auditoría independiente del desempeño.
- **Comunidad contextual:** conversación por pronóstico, límites de publicación y herramientas de reporte y moderación con permisos controlados.
- **Presencia para streaming:** widget público con formatos visuales seleccionables desde el panel tipster, sin instalar un complemento nativo.
- **Herramientas privadas del creador:** panel para perfil e historial, informes de picks y un registro manual privado de aperturas y movimientos por moneda. No es una cuenta bancaria ni integra pagos.
- **Interfaz cuidada:** lenguaje visual oscuro con acentos esmeralda, superficies compartidas, tipografía Plus Jakarta Sans, diseños adaptables, skeletons, mensajes de estado y microinteracciones breves.
- **Atención a accesibilidad y control:** foco visible, controles etiquetados, diálogos nativos y soporte de movimiento reducido en superficies relevantes.

## Arquitectura y calidad

El producto es una aplicación web estática HTML5 con módulos JavaScript ES, CSS propio y Tailwind CSS 3.4 compilado para las páginas principales. Firebase Authentication administra sesiones y Cloud Firestore almacena los datos; Hosting publica el sitio. La aplicación consulta Firestore desde el cliente bajo reglas de seguridad. No hay API propia, Cloud Functions, Firebase Storage, pagos ni suscripciones activas.

Playwright cubre pruebas de lógica, interfaz y recorridos de navegador; ESLint aporta análisis estático. Los entornos de prueba están orientados a emuladores de Auth y Firestore. No se publica aquí una métrica de rendimiento, disponibilidad, retención, conversión o rentabilidad porque no hay una fuente verificada en este repositorio para respaldarla.

## Oportunidad de mercado y modelo de valor

La oportunidad está en servir a dos lados de una misma comunidad: lectores que necesitan descubrir y seguir creadores, y tipsters que necesitan distribuir su actividad en un formato consistente y fácil de compartir. La capa comunitaria y la presencia en streaming pueden ampliar los puntos de contacto sin que la plataforma tenga que producir los pronósticos.

El modelo económico no está activado. No hay cobros, paywall, reparto de ingresos ni promesa de planes pagos. En el futuro podrían evaluarse herramientas premium para creadores, suscripciones o servicios para aliados, pero primero deben validarse demanda, disposición de pago, obligaciones regulatorias y capacidad operativa. Cualquier acceso de pago requeriría autorización del lado servidor y procesos de pago y conciliación; no debe simularse con permisos decididos por el cliente.

## Escalabilidad y próximos hitos

La entrega estática y los servicios administrados de Firebase reducen la carga de operar servidores propios para el MVP. La arquitectura separa funcionalidades en módulos y limita determinadas suscripciones del feed por grupos de tipsters. A medida que crezcan los usuarios y la actividad, habrá que medir costos y cuotas de Firebase, lecturas en tiempo real, moderación y soporte, y revisar la estrategia de datos y observabilidad.

Hitos razonables para validar antes de proyectar crecimiento:

1. Completar los datos de operador y contacto, y obtener revisión legal de los documentos aplicables a cada mercado.
2. Definir el canal de soporte, las políticas de moderación y el proceso operativo de aprobación de tipsters.
3. Medir activación, retención, seguimiento, participación y costos con tráfico real antes de presentar proyecciones numéricas.
4. Probar la demanda de herramientas para creadores y, si se valida monetización, diseñar su autorización y operación en backend.

## Alcance y cautelas

La documentación describe funcionalidades presentes en el código; no representa una certificación legal, de seguridad, de resultados deportivos ni de disponibilidad comercial. El aviso legal del proyecto requiere completar y revisar la información correspondiente antes de una apertura pública amplia. Todo usuario debe cumplir las reglas de edad y jurisdicción aplicables; la casilla de registro es una declaración, no una verificación de edad.
