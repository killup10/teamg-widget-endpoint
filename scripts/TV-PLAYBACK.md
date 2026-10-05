# v2.5.31 — TV estable, carátulas y subtítulos

El widget sigue siendo ES5. `native-player.js` es un adaptador opcional de Samsung AVPlay. Auto comprueba funciones reales; una marca detectada no garantiza acceso a la API desde Media Station X. Sin API o si falla la preparación (máximo 20 segundos), vuelve a HTML5. Errores reales durante reproducción usan la recuperación existente; ningún temporizador recarga una señal sana.

Controles AVPlay: pausa/reanudar, búsqueda, progreso, audio y subtítulos TEXT. Samsung usa coordenadas de video 1920×1080, independientes del viewport. La salida de subtítulos nativos se muestra como texto en el overlay. No hay garantía para pistas PGS u otros formatos no admitidos por la TV. La primera puesta en producción requiere comprobar reproducción y teclas en una Samsung real.

Ajustes muestra motores disponibles; IPTV cambia el motor de canales en vivo. HLS controla la ruta HTML5: Auto prefiere HLS nativo y usa HLS.js si es necesario. Las preferencias IPTV/HLS antiguas, que antes no intervenían en la reproducción, se migran una vez a Auto.

No se analiza ni descarga un MKV en Render al reproducirlo o seleccionar subtítulos. Las TVs con pistas nativas compatibles las usan directamente. Para los demás equipos se puede subir SRT o WebVTT UTF-8 (máximo 2 MB) desde el editor de canal/episodio. Se convierte a WebVTT y se guarda en MongoDB, compartido entre clientes. No se modifican los videos.

Para extraer subtítulos de texto de un MKV una vez, en el PC del administrador con FFmpeg instalado:

```powershell
python scripts/prepare-subtitles.py "D:\Videos\episodio.mkv" --output .private-artwork/subtitles/mi-serie-t1e1
```

La extracción puede leer el archivo completo, pero ocurre fuera del servicio de reproducción y se reutiliza. No convierte subtítulos de imágenes ni conserva toda la presentación ASS. Cada episodio requiere su archivo correspondiente; no se aplica un subtítulo de episodio a toda la serie.

Al guardar una carátula de serie, el panel la prepara una vez como JPEG baseline de 400×225 (horizontal) o 300×450 (vertical), conservando proporción y añadiendo márgenes si hace falta. El enlace original puede ser WebP; la TV recibe JPEG. Conversión limitada a una imagen simultánea, 4 MB de descarga y 16 millones de píxeles de entrada. Los resultados se deduplican por contenido y se guardan en MongoDB. Las carátulas existentes no se convierten al abrir un catálogo: hay que guardarlas desde su serie.

Al actualizar M3U, las imágenes horizontal y vertical del grupo se combinan sin borrar una con un campo vacío. Las solicitudes de listas y subtítulos tienen plazo de espera y se cancelan al abandonar su pantalla. El M3U servido no se guarda en la caché HTTP del navegador.

Validación: `node scripts/native-player.test.js`, `node scripts/subtitles.test.js`, `node scripts/media-import.test.js`, `node scripts/playlist-load.test.js`, `node scripts/tv-syntax.test.js`, además de los checks de navegación y carátulas existentes. Estas pruebas simulan AVPlay; no sustituyen la prueba en el hardware Samsung.
