# Guía para Usar tu Nuevo Dominio `teamgplay.online` (La Solución Definitiva)

¡Felicidades por comprar `teamgplay.online`! Esta es la solución correcta. Aquí están los pasos exactos para configurarlo.

### Paso 1: Configurar DNS en Namecheap

1.  **Inicia sesión en tu cuenta de Namecheap.**
2.  Ve a tu **"Dashboard"** y busca el dominio `teamgplay.online`.
3.  Haz clic en el botón **"Manage"** que está al lado del dominio.
4.  Asegúrate de que en la sección "NAMESERVERS", esté seleccionada la opción **"Namecheap BasicDNS"**. Esto es crucial. **NO uses "Cloudflare Nameservers"**.
5.  Ve a la pestaña **"Advanced DNS"**.

Ahora vas a configurar los registros. Namecheap a veces crea un par de registros por defecto.
*   **Si ves algún registro existente (especialmente un `CNAME Record` para `www` o un `A Record` para `@`), elimínalos usando el icono del bote de basura.**

Después de limpiar, haz clic en **"ADD NEW RECORD"** y crea **DOS** registros:

**Registro 1 (Para `teamgplay.online`):**
*   **Type:** `CNAME Record`
*   **Host:** `@`
*   **Value:** `widget-teamg-store.onrender.com`
*   **TTL:** `1 min` (o el valor más bajo que te permita)
*   Haz clic en la marca de verificación verde para guardar.

**Registro 2 (Para `www.teamgplay.online`, opcional pero recomendado):**
*   **Type:** `CNAME Record`
*   **Host:** `www`
*   **Value:** `widget-teamg-store.onrender.com`
*   **TTL:** `1 min`
*   Haz clic en la marca de verificación verde para guardar.

### Paso 2: Añadir el Dominio en Render

1.  Ve a la configuración de tu servicio en Render (`widget-teamg-store`).
2.  En el menú, ve a **"Custom Domains"**.
3.  Haz clic en "Add Custom Domain" y añade `teamgplay.online`.
4.  Haz clic de nuevo y añade `www.teamgplay.online`. Render verificará ambos. Este proceso puede tardar desde unos minutos hasta una hora mientras el DNS se propaga.

### Paso 3: Verificación Final

1.  Espera a que Render muestre que el dominio está verificado.
2.  Abre una terminal y ejecuta: `curl -v http://teamgplay.online`
3.  La respuesta debe ser `HTTP/1.1 200 OK` directamente, sin redirecciones.
4.  ¡Listo! Ya puedes usar `http://teamgplay.online` en Media Station X.
