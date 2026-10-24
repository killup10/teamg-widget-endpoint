# Auditoría de transferencia de TeamG — 23 de octubre de 2026

## Dictamen

Hay defectos reproducibles y exposición a consumo no autorizado. El código no funciona solamente como un catálogo: también descarga canciones completas, retransmite contenido y, en algunas rutas, empaqueta video con FFmpeg. Esto hace que una cuota de 5 GB pueda agotarse con uso legítimo, incluso después de arreglar las ineficiencias.

No existe evidencia suficiente para adjudicar los 3,74 GB del mes a una ruta, a un fallo específico ni a un tercero. Los registros desplegados no contienen bytes, estado HTTP, Range ni identidad del cliente. Las repeticiones de GET pueden ser sondeos/rangos normales de un reproductor; no prueban descargas completas duplicadas.

Comprar un VPS antes de atender estas causas cambia el límite disponible, pero mantiene los defectos y los proxies abiertos.

## Alcance y evidencia

- Lectura autenticada de Billing, Metrics, Deploys y Application Logs en Render. Sin cambiar planes, variables, credenciales, servicios ni desplegar.
- Se confirmó que el commit activo de `teamg-widget-endpoint` es `f43cff0c5bfff112ebeee73e6c9a7ae7ce39ea8b`, igual a HEAD local. Los cambios locales previos en `server.js`, `ott-api.js` y `static-files.js` no están desplegados.
- Inspección del servidor, reproductores, proxies, música, imágenes, listas, MongoDB y empaquetado Android.
- Revisión complementaria del repositorio vecino `../iptv-backend` y del consumidor de speedtest en `../iptv-frontend-clean-updated`. No se verificó que el HEAD local de esos repositorios coincida con producción; sus hallazgos se consideran de código local.
- Pruebas con proveedores simulados y servidores de loopback. No se descargaron canciones reales ni se ejecutaron pruebas de carga contra producción.
- Las búsquedas semanales de música, video e imágenes devolvieron muestras. Las búsquedas de Android y Deezer no entregaron un resultado utilizable durante la revisión; no se interpreta eso como ausencia de actividad.

## Consumo confirmado en Render

| Servicio | Total mensual | HTTP Responses | Service-Initiated |
|---|---:|---:|---:|
| teamg-widget-endpoint | 2,93 GB | 2,31 GB | 630 MB |
| iptv-backend | 826 MB | 398 MB | 427 MB |
| Workspace | 3,74 GB / 5 GB | 2,70 GB | 1,03 GB |

Las cifras están redondeadas por Render. El endpoint OTT representa aproximadamente el 78 % del total. No se observaron cargos por excedente de transferencia; el cargo de servicios mostrado en Billing es una categoría distinta.

**Distinción crucial:** descargar audio desde un proveedor es entrada a Render, que no se factura como transferencia saliente. Volver a enviar ese audio a la TV sí cuenta. Service-Initiated mide datos enviados a destinos externos: puede incluir peticiones, escrituras a bases de datos, conexiones y otros protocolos. No se puede llamar a sus 630 MB «canciones descargadas».

Fuentes: [reglas de transferencia de Render](https://render.com/docs/outbound-bandwidth), [métricas y retención](https://render.com/docs/service-metrics). Hobby conserva siete días de métricas y el gráfico de transferencia no permite filtrar por ruta. El total mensual no se puede reconstruir con precisión a partir de ese gráfico semanal.

## Hallazgos priorizados

### 1. Alta: proxies de contenido accesibles sin autenticar

**Evidencia:** `server.js:250` entrega `/api/ott/img`; `server.js:295` entrega `/api/ott/stream*` antes del manejo autenticado. El destino solo se comprueba como HTTP/HTTPS. Música también tiene rutas anteriores a la autenticación.

La prueba local confirma que una llamada sin token llega al proxy de video. El proxy de imágenes acepta incluso 2 MiB de `text/plain` como si fuera una imagen. No hay cuota por dispositivo, límite de transferencia, lista de destinos ni bloqueo de direcciones internas en esas rutas. CORS abierto no es autenticación.

**Consecuencia:** terceros pueden generar respuestas pagadas o intentar alcanzar destinos internos. No se encontró evidencia que demuestre explotación real.

**Corrección recomendada:** autorizar al usuario/dispositivo antes de emitir URLs de reproducción; usar firmas con caducidad compatibles con TVs que no permiten headers; limitar destinos, redirecciones, conexiones y consumo. Para imágenes, restringir proveedores y validar tipo/tamaño además del destino.

### 2. Alta: audio MP3 etiquetado como MP4

**Evidencia:** `deezer-service.js` devuelve `audio/mpeg`, pero `ott-music.js:1694` y `:1707` lo guardan/envían como `video/mp4`. Además, `ott-music.js:513` fuerza `video/mp4` por la extensión de la URL aunque el MIME real sea MP3.

**Reproducción:** proveedor simulado devuelve MP3; respuesta anuncia `video/mp4`.

**Consecuencia:** incompatibilidad con decodificadores y posibles reintentos. La prueba demuestra el MIME incorrecto, no que una TV concreta haya duplicado una canción por esta causa.

**Corrección:** conservar contenedor y MIME reales; si un dispositivo exige MP4, remultiplexar de verdad antes de declararlo como tal y verificarlo en ese dispositivo.

### 3. Media: HEAD resuelve y descarga canciones completas

**Evidencia:** `handleMusicStream` realiza resolución/descarga antes de llegar a la comprobación HEAD de `serveAudioBufferWithRange` (`ott-music.js:510`, `:1692`).

**Reproducción:** una petición HEAD en caché fría provoca una descarga completa simulada de 1 MiB, aunque responde sin cuerpo.

**Consecuencia:** trabajo, memoria y tráfico entrante innecesarios; un GET simultáneo puede repetir el trabajo. La descarga entrante no debe sumarse como 1 MiB facturado por Render.

**Corrección:** servir metadatos conocidos o consultar metadatos del origen sin descargar el cuerpo; evitar que HEAD active los respaldos de descarga completa.

### 4. Media: peticiones simultáneas duplican la descarga de una pista

**Evidencia:** `ott-music.js:1692` y SoundCloud no comparten una resolución en curso por pista. El respaldo yt-dlp sí tiene un mapa `pendingAudioFetches`, pero no cubre esos caminos.

**Reproducción:** dos GET simultáneos con la misma pista y caché fría invocan dos veces al proveedor simulado.

**Consecuencia:** duplica recursos del servidor y descargas entrantes. Si ambos clientes consumen sus respuestas, cada respuesta saliente cuenta; los logs actuales no permiten conocer qué proporción ocurrió.

**Corrección:** compartir una promesa de resolución por pista y limpiar al finalizar/fallar; gestionar cancelación por consumidor para no detener una descarga aún utilizada por otro.

### 5. Media: Range por sufijo entrega bytes equivocados

**Evidencia:** `ott-music.js:527` interpreta un inicio vacío como cero.

**Reproducción:** `Range: bytes=-128` sobre 1.048.576 bytes devuelve `bytes 0-128/1048576` y 129 bytes, en lugar de los últimos 128.

**Consecuencia:** rompe sondeos y búsqueda al final del archivo; puede causar más peticiones o fallos de reproducción. No equivale a descargar toda la pista en esta reproducción.

**Corrección:** implementar rangos de sufijo, extremos y 416 correctamente, con pruebas de HEAD/GET y límites.

### 6. Alta: proxy de imágenes sin límites de tamaño ni cancelación completa

**Evidencia:** `server.js:266–291` usa GET incluso si el cliente hizo HEAD; acumula todos los chunks; el máximo de caché es 200 entradas, sin presupuesto de bytes; no valida MIME de imagen; configura timeout pero no maneja el evento para destruir la conexión; tampoco cancela al cerrar la respuesta del cliente.

**Reproducción:** una HEAD al proxy descarga y prepara un cuerpo no gráfico completo de 2 MiB. Node suprime el cuerpo en una HEAD real, pero el trabajo de descarga ya ocurrió.

**Consecuencia:** memoria sin límite proporcional, trabajo abandonado, solicitudes colgadas y transferencia saliente de archivos arbitrarios para GET.

**Corrección:** límite por archivo y total de caché, cancelación explícita por timeout/cierre, validación de respuesta, deduplicación de solicitudes en curso y política de destinos.

### 7. Media: precarga automática y caché de música poco efectiva

**Evidencia:** `ott-music.js:2114–2132` intenta descargar cinco canciones dos segundos después de cargar el módulo, incluso sin reproducción. Cada pista puede ocupar dos claves: artista/título e ID de YouTube. El máximo es 12 entradas y el TTL es 15 minutos (`:236–245`).

**Consecuencia:** hasta cinco descargas automáticas por carga de módulo/proceso, si el proveedor funciona. Doce claves no equivalen a doce pistas: con dos claves por pista pueden ser aproximadamente seis. Despliegues/reinicios pierden esta caché.

No se usa un temporizador que repita esta precarga cada dos segundos: ocurre una vez por carga de módulo. Tampoco esos archivos entrantes son por sí mismos ancho de banda facturado.

**Corrección:** eliminar precarga no solicitada, usar claves alias sin duplicar el presupuesto lógico y limitar bytes reales además del número de entradas.

### 8. Media: cancelación y temporizadores no abarcan toda la resolución

**Evidencia:** las descargas completas de Deezer/SoundCloud no reciben la señal de cierre del consumidor. En Deezer el timeout se limpia tras recibir headers, antes de `arrayBuffer()` (`deezer-service.js:156–164`). Un `Promise.race` de 12 s en `ott-music.js:1720` no cancela el trabajo perdedor.

**Consecuencia:** cambiar o abandonar una canción puede dejar trabajo pendiente; un cuerpo lento puede superar el plazo anunciado. Principalmente CPU, RAM y entrada; los envíos posteriores activos son los que añaden salida.

**Corrección:** plazo que abarque headers y cuerpo, AbortSignal a lo largo de los proveedores y cancelación con conteo de consumidores para trabajos compartidos.

### 9. Diseño: algunas reproducciones necesariamente cruzan Render

**Evidencia:** `ott/index.html:6720` usa proxy para fuentes HTTP en página HTTPS; `ott-api.js:1340–1358` reescribe segmentos HLS a Render salvo `manifestOnly=1`. `ott/index.html:6783–6808` prepara HLS/AAC para Android o TS crudo cuando el motor HTML5 necesita empaquetado; `android-audio.js` conserva video y convierte audio.

**Consecuencia:** la conversión de audio con copia de video sigue enviando todo el video desde Render. El modo manifest-only no garantiza cero proxy porque las claves HLS también se reescriben. Algunas etiquetas HLS con URI no se reescriben de forma completa, lo que merece pruebas adicionales de manifiestos reales.

Se confirmó también lo que funciona: CDNs explícitos usan reproducción directa; NetCast/Tizen nativos evitan el empaquetado cuando su decodificador acepta la señal; existen cancelación del reproductor, stop de sesión y recolección por inactividad. No se encontró una regla que mande todos los canales por Render.

**Corrección:** registrar el motivo de cada fallback y la ruta efectivamente seleccionada; mantener reproducción directa cuando sea compatible. No cambiar HTTP a HTTPS a ciegas ni eliminar el proxy necesario para TVs antiguas.

### 10. Media: estáticos pesados sin reutilización en producción

**Evidencia:** el servidor desplegado usa `no-store` y no comprime estáticos. `ott/logo-teamg.png` tiene 1.599.719 bytes y mide 1254×1254; el HTML, 310.721 bytes; hls.js, 413.181 bytes.

**Mediciones locales:** HTML gzip de 71.570 bytes (77 % menos); hls.js gzip de 124.697 bytes. Una miniatura de logo de hasta 400×400 generada solo en memoria ocupa 53.590 bytes; no se reemplazó el archivo ni se hizo aprobación visual de esa conversión.

Los tres archivos originales suman aproximadamente 2,32 MB por descarga conjunta; mil cargas equivaldrían a unos 2,32 GB si cada una descargara los tres sin caché. Es un escenario ilustrativo, no el número de aperturas observado.

**Estado:** la mejora local de caché/gzip pasa las pruebas. No comprime música/video y no demuestra que los estáticos expliquen el gasto principal. Antes de desplegar conviene versionar o revalidar scripts: un `max-age=86400` con nombres estables puede conservar JavaScript viejo durante un día.

### 11. Alta: credencial incrustada y diagnóstico público sensible

**Evidencia:** `deezer-service.js:12` contiene una credencial de sesión predeterminada en código. No se reproduce su valor en este informe. `server.js:164–238` ofrece un diagnóstico sin autenticar que ejecuta pruebas externas/subprocesos y puede incluir una muestra del archivo de cookies (`:207`).

**Consecuencia:** exposición de credenciales y activación de trabajo externo sin autorización. No se verificó la validez de la credencial ni se invocó el diagnóstico en producción.

**Corrección:** retirar secretos del código, usar variables de entorno y renovar la credencial expuesta; restringir o desactivar diagnóstico en producción y no devolver contenido de cookies. La renovación debe realizarla el titular de la cuenta.

### 12. Complementario: otros consumidores en iptv-backend

**Código local:** `../iptv-backend/app.js:118` envía 5 MiB aleatorios por ejecución de `/api/speedtest`, antes del control de versión/autenticación. El frontend lo solicita al ejecutar la prueba de velocidad. Cien pruebas completas representan 500 MiB salientes. El logger excluye speedtest, así que sus logs de rendimiento no lo cuantifican.

`../iptv-backend/index.js:108` y `:137` exponen `/img-proxy` y `/proxy` con destinos arbitrarios, sin autenticación propia ni cancelación explícita del upstream al desconectar el cliente. La protección de versión/CORS anterior no autoriza al usuario y puede no evitar llamadas sin Origin. Hay un proxy de canales autenticado distinto. Los videos bajo token utilizan redirección directa, lo que evita retransmitir el archivo en ese camino.

También hay sincronización de guías cada seis horas y tráfico hacia MongoDB. Ninguno puede adjudicarse a los 427 MB Service-Initiated sin medición por destino. Estos hallazgos no demuestran el estado desplegado del backend.

### 13. Limitación de la medición que añadí antes

El contador local de `server.js:133–147` mide cuerpos entregados a `write/end`, no bytes facturados o confirmados en la red. No cuenta cabeceras/TLS y puede sobrecontar cuerpos suprimidos por HEAD o datos encolados antes de una desconexión. No mide salida de MongoDB, proveedores ni procesos hijos. Tampoco registra Range ni motivo del proxy.

Debe llamarse `payloadBytesQueued` y tratarse como estimación, añadir estado/método/Range sanitizado, identificador de petición, duración y motivo de ruta. Debe agregarse por categoría y cruzarse con Render; para Service-Initiated se necesita instrumentación separada por destino/protocolo. No registrar tokens, cookies, URLs completas con credenciales ni IPs innecesarias.

## Comprobaciones y límites

Se añadió `scripts/bandwidth-audit.test.js`: reproduce los defectos con proveedores simulados y verifica los estáticos nuevos. Sus aserciones de defectos documentan el estado observado; que termine correctamente no significa que los defectos estén arreglados. Se ejecuta con `node scripts/bandwidth-audit.test.js`.

Se ejecutaron doce scripts existentes: nueve terminaron correctamente y tres fallaron por contexto incompleto de sus fixtures VM. `netcast-direct-start.test.js` y `netcast-live-routing.test.js` no proporcionan `isSmartTvDevice`; `playlist-load.test.js` no proporciona `window`. El HTML evaluado no fue modificado durante esta auditoría ni en los cambios previos de este chat, por lo que estos fallos no acreditan una regresión nueva. Tampoco se considera toda la batería aprobada.

Pasaron: stream-mime, manifest-only, modern-tv-routing, player-revocation, catalog-images, tv-syntax, android-audio, android-hls y channel-playback-resilience. Se comprobó sintaxis Node y `git diff --check` en los cambios locales. Runtime local: Node 25.2.1; no equivale a probar en una TV física ni en el runtime exacto de Render.

Los registros de música muestran pares de GET de la misma URL con 1–3 segundos de diferencia el 22 de octubre. Video muestra solicitudes a manifiestos y algunos segmentos `.ts`; imágenes muestra ráfagas al abrir catálogos. Son muestras de la UI, no un censo de siete días. No se recuperó un ranking mensual por bytes.

## Orden propuesto de intervención

1. Cerrar los proxies abiertos y proteger el diagnóstico manteniendo URLs firmadas compatibles con TVs. Retirar y renovar la credencial incrustada.
2. Corregir MIME, HEAD, rangos, descargas concurrentes y cancelación de música; desactivar precargas innecesarias.
3. Limitar y cancelar imágenes; publicar estáticos comprimidos con una política de actualización segura.
4. Instrumentar por ruta/motivo y destino externo. Medir un ciclo controlado de abrir catálogo, reproducir, cambiar, detener y esperar; comprobar que el consumo se detiene.
5. Evaluar alojamiento con la transferencia legítima restante. A 128 kbps, una hora de audio enviado consume aproximadamente 57,6 MB; a 4 Mbps, una hora de video enviado consume 1,8 GB, sin contar overhead. La cuota de 5 GB limita una arquitectura que retransmite medios, aunque esté bien implementada.

En esta auditoría se agregaron únicamente este informe y el script de reproducción. Los cambios de aplicación previos permanecen locales. No se hicieron commits, push, despliegues ni cambios de cuenta.
