# Audio compatible con Android

Solo Android comprueba el audio de señales en vivo fuera de los CDN que ya funcionan directamente. MP2, AAC-LATM, AC-3 y E-AC-3 se convierten a AAC-LC estéreo; el video se copia sin recodificación. LG, webOS, Samsung y los archivos VOD mantienen sus rutas anteriores.

El servidor necesita procesos Node persistentes (Render/Railway). `ffmpeg-static` instala el ejecutable durante `npm install`; `FFMPEG_PATH` permite utilizar uno administrado por el operador. `GET /api/ott/android-audio/status` comprueba que el ejecutable arranca.

La preparación requiere una sesión de cliente válida y una URL incluida en una playlist asignada y vigente. Los archivos temporales se entregan mediante un identificador aleatorio de sesión. Cambiar de canal o salir solicita el cierre; las sesiones abandonadas terminan tras 45 segundos sin peticiones. Cada sesión tiene un máximo de 30 minutos, segmentos rotativos y un límite de 96 MiB en disco.

Por defecto se permiten **dos conversiones simultáneas**, para limitar consumo en el servidor existente. `ANDROID_AUDIO_MAX_SESSIONS` admite entre 1 y 4; dimensionar CPU, memoria y ancho de banda antes de aumentarlo. Cuando no hay capacidad, la app informa el error y conserva la señal original. La conversión no convierte códecs de video ni resuelve fuentes caídas o protegidas por DRM.
