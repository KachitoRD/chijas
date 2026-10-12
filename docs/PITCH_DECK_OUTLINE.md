# Fijas en vivo — Guion de pitch

**Actualizado: 11 de octubre de 2026**

## Mensaje clave

> Fijas en vivo conecta el descubrimiento de tipsters aprobados con pronósticos públicos, seguimiento personalizado, conversación contextual y herramientas para compartir picks en streaming.

## Guion de 10 diapositivas

| # | Diapositiva | Mensaje clave y puntos principales | Idea visual o demostración |
|---|---|---|---|
| 1 | **La oportunidad** | Los pronósticos y la actividad de sus autores suelen quedar repartidos en canales difíciles de seguir. Fijas en vivo organiza descubrimiento y seguimiento en una experiencia web. | Captura del inicio con directorio, búsqueda y feed; evitar cifras de mercado no verificadas. |
| 2 | **El problema** | A lectores les cuesta encontrar creadores y volver a consultar lo que publican; a tipsters les cuesta mantener una presencia consistente y compartir sus selecciones en transmisiones. | Diagrama sencillo de información fragmentada frente al flujo unificado de la plataforma. |
| 3 | **La solución** | Perfiles aprobados manualmente, pronósticos públicos atribuibles, feeds Explorar y Siguiendo, y contexto para conversar alrededor de cada pronóstico. | Recorrido breve: abrir perfil, filtrar por deporte y seguir un tipster. |
| 4 | **La experiencia del lector** | Descubrimiento en tiempo real, filtros y feed personalizado; la aprobación de un publicador no debe confundirse con auditoría de sus resultados. | Capturas escritorio y móvil del feed, perfil y estado de seguimiento. |
| 5 | **La experiencia del tipster** | Panel para gestionar perfil, pronósticos e historial, con reportes y controles privados para sus propios datos. | Demo del panel y de la vista de historial, sin mostrar correos ni datos financieros privados. |
| 6 | **Comunidad y confianza operativa** | Conversaciones por pronóstico y herramientas de reporte y moderación sujetas a permisos. Las reglas de acceso no dependen del rol elegido en la interfaz. | Flujo visual de un comentario, reporte y revisión moderada; no presentar esto como garantía contra todo abuso. |
| 7 | **Distribución en streaming** | El widget OBS convierte selecciones elegidas por el tipster en una fuente de navegador; los formatos disponibles pueden verse en una demostración. | Añadir la URL del widget como fuente de navegador y mostrar sus formatos sobre una escena de prueba. |
| 8 | **Tecnología y calidad** | HTML y módulos ES, CSS/Tailwind, Firebase Auth, Firestore y Hosting; reglas de Firestore, ESLint y pruebas Playwright. Sin API propia ni pagos activos. | Diagrama de cliente → Auth/Firestore protegidos por reglas → Hosting; incluir emuladores en el flujo de pruebas. |
| 9 | **Modelo de valor y validación** | Hoy el acceso no tiene suscripciones ni cobros activos. La hipótesis de herramientas premium para creadores requiere validar demanda, precio, regulación y ejecución segura antes de proyectar ingresos. | Mapa de hipótesis y experimentos propuestos; no incluir forecast ni tamaño de mercado sin datos documentados. |
| 10 | **Visión y próximos hitos** | Validar uso recurrente, calidad operativa y costos; completar preparación legal y de soporte; evaluar backend y monetización solo cuando haya evidencia. | Roadmap en tres etapas: validar, optimizar y escalar; cierre con invitación a piloto o alianza. |

## Notas para quien presenta

- Usar pantallas reales del entorno autorizado y ocultar cuentas, correos y datos privados.
- No prometer acierto, ganancias, certificación de tipsters, volumen de usuarios o escalabilidad ilimitada.
- Distinguir claramente la actividad implementada de las hipótesis de negocio futuras.
- Confirmar previamente qué funciones están disponibles en el entorno de demostración y con qué datos de prueba.
