# Carátulas por playlist

Versión publicada: v2.5.23 — Carátulas por lotes.

El importador local prepara JPEG de 400 × 225. No ejecuta el antiguo bot ni
lee sus sesiones. Desde el editor de una playlist, «Completar carátulas
locales» recibe el paquete JSON y completa solo imágenes vacías.

El servidor identifica cada entrada por nombre, grupo y URL, compara la
revisión de la lista y modifica sus bloques M3U originales. Conserva atributos
desconocidos, enlaces, opciones de reproducción e imágenes existentes. Guarda
el M3U inicial en `artworkBackup` para recuperación administrativa. Las imágenes
se identifican por SHA-256 y los lotes se pueden retomar tras recargar el editor.

`prepare-artwork.py` genera el paquete local en `.private-artwork/`.
`reconcile-local-artwork.py` genera propuestas para nombres del bot antiguo;
esas propuestas requieren revisión visual antes de publicarlas porque el bot
antiguo pudo guardar una imagen de otra película.

Para completar desde TMDB:

1. Guardar el API Read Access Token de la cuenta TMDB en
   `.private-artwork/tmdb-token.txt`. No se publica ni se guarda en Git.
2. Guardar el JSON del cuadro «Títulos pendientes de carátula» en
   `.private-artwork/pending.json`.
3. Ejecutar `complete-artwork-tmdb.py`. Usa título y año exactos, conserva
   respuestas en caché y deja coincidencias ambiguas pendientes.
4. Revisar el informe y las imágenes; importar `tmdb-covers.json` únicamente
   en la playlist correspondiente. No se modifican otras playlists.

Pruebas: `node scripts/artwork-fill.test.js` y
`node scripts/artwork-api.test.js`. La segunda usa almacenamiento aislado en
memoria y nunca conecta a MongoDB de producción.
