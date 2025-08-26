# Guía de Despliegue con Railway y Cloudflare

Hola. Esta guía te ayudará a desplegar el servidor en Railway y a configurar tu dominio `widget.teamg.store` (que está en Cloudflare) para que funcione correctamente sin redirecciones a HTTPS.

## Parte 1: Limpiar tu Configuración Antigua en Cloudflare

Es muy importante eliminar cualquier configuración vieja que pueda causar conflictos.

1.  **Elimina el Worker Antiguo**:
    *   En el menú de Cloudflare, ve a "Workers & Pages".
    *   Busca el Worker que tenías para `widget.teamg.store`.
    *   Ve a su configuración y **elimina la ruta (Route)** que lo activa, o si ya no lo necesitas para nada más, **elimina el Worker por completo**.

2.  **Elimina el Proyecto de Cloudflare Pages (si existe)**:
    *   En la misma sección de "Workers & Pages", si tienes un proyecto de "Pages" conectado a este repositorio de GitHub, búscalo y elimínalo para evitar despliegues duplicados.

3.  **Limpia los Registros DNS Antiguos**:
    *   Ve a la sección de "DNS" para tu dominio `teamg.store`.
    *   Busca cualquier registro DNS (probablemente de tipo `A`, `AAAA` o `CNAME`) que esté asociado con el nombre `widget`. **Elimínalo**. Este paso es crucial.

## Parte 2: Configurar y Desplegar en Railway

Ahora que Cloudflare está limpio, vamos a configurar Railway.

1.  **Crea el Servicio en Railway (si no lo has hecho)**:
    *   Viendo tu captura de pantalla, parece que ya has completado este paso. Si no, crea un nuevo "Web Service" y conéctalo a tu repositorio de GitHub `teamg-widget-endpoint`. Railway detectará la configuración de Node.js automáticamente.

2.  **Genera un Dominio Público en Railway**:
    *   Dentro de tu proyecto en Railway, ve a la pestaña **"Settings"**.
    *   Busca la sección **"Networking"**.
    *   Haz clic en el botón **"Generate Domain"**. Se creará una URL pública (algo como `teamg-widget-endpoint-production.up.railway.app`). Puedes hacer clic en esa URL para probar que el servidor responde con el JSON.

3.  **Añade tu Dominio Personalizado en Railway**:
    *   Justo debajo de donde generaste el dominio, verás la opción **"Custom Domain"**.
    *   Escribe `widget.teamg.store` en el campo y haz clic en "Add Domain".
    *   Railway te mostrará el valor `CNAME` al que debes apuntar. Será la URL pública que generaste en el paso anterior. Copia esta URL.

## Parte 3: Conectar Cloudflare a Railway

1.  **Crea el Nuevo Registro DNS en Cloudflare**:
    *   Vuelve a la sección de "DNS" en Cloudflare para tu dominio `teamg.store`.
    *   Haz clic en "Add record".
    *   **Type**: `CNAME`
    *   **Name**: `widget`
    *   **Target**: Pega la URL de Railway que copiaste (ej. `teamg-widget-endpoint-production.up.railway.app`).
    *   **Proxy status**: **¡Paso Clave!** Asegúrate de que la nube esté **GRIS (DNS only)**. Esto es fundamental para que no haya redirección a HTTPS.
    *   Haz clic en "Save".

## Parte 4: Verificación Final

1.  **Verifica en Railway**: Después de unos minutos, la sección "Custom Domain" en Railway debería mostrar tu dominio `widget.teamg.store` como verificado.
2.  **Prueba con cURL**: Abre una terminal en tu computadora y ejecuta el comando `curl -v http://widget.teamg.store`. La respuesta debe incluir `HTTP/1.1 200 OK` y el código JSON. **No debe haber ninguna línea que diga `Location:` ni respuestas `301` o `308`**.
3.  **Configura tu TV**: ¡Listo! Ahora puedes usar `widget.teamg.store` como el parámetro de inicio en Media Station X.

---

## Troubleshooting

### Advertencia: "This rule may not apply to your traffic"

Si después de crear la Regla de Configuración para `widget.teamg.store` (la que pone SSL en `Off`), Cloudflare te muestra una advertencia que dice `This rule may not apply to your traffic because your DNS configuration may not route traffic for this hostname to Cloudflare`, **esto es una BUENA noticia**.

Este mensaje es normal y esperado. Significa que Cloudflare ha detectado que el tráfico para `widget.teamg.store` no está pasando por su proxy (porque la nube está gris), que es **exactamente lo que queremos**.

**Acción:** Ignora esta advertencia y procede con el último paso de verificación.

### Verificación Final (Después de la regla SSL: Off)

Después de crear la regla y ver la advertencia, el último paso es hacer la prueba final con `curl`.

1.  Ve a **Caching → Configuration** y haz clic en **"Purge Everything"**.
2.  Espera un minuto.
3.  Abre una terminal y ejecuta:
    ```bash
    curl -v http://widget.teamg.store
    ```
4.  La respuesta **debe** ser `HTTP/1.1 200 OK`. Si es así, ¡lo has logrado! Ya puedes usarlo en tu TV.
