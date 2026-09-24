# OTT TV - 2da app (separada de TeamG Play)

App estilo OTTPlayer que vive en la misma carpeta/servicio que el widget TeamG,
pero con ID, JSON y pantalla propios. TeamG Play sigue intacto en `/`.

## Qué se creó (solo dentro de `teamg-widget-endpoint/`)

- `ott/index.html` - app nueva: cargar M3U por URL/archivo/demo, grupos,
  buscador, favoritos (☆/★), ocultar/mostrar canales, reproductor HLS,
  navegación con control remoto (flechas + Enter + Volver).
- `ott/icon.png` - icono verde propio, distinto al de TeamG.
- `server.js` - ahora sirve 2 apps del mismo proceso:
  - `/` -> JSON TeamG Play (`com.teamg.play.netcast`) - sin cambios de ID
  - `/ott` y `/ott.json` -> JSON OTT TV (`com.ott.clone.tv`)
  - `/ott/*` -> archivos de `ott/`
  - resto -> archivos de `public/` (TeamG, igual que antes)
  - URLs construidas con el Host real, ya no hardcodea `teamgplay.online`
    (ese dominio ya no lo tienes).

## Dominio con `teamg.store` (recomendado)

Usa un subdominio nuevo para no mezclar con TeamG:

1. Render -> tu servicio `widget` -> Custom Domains -> añade
   `ott.teamg.store` (mantén también `widget.teamg.store` para TeamG).
2. Cloudflare -> DNS de `teamg.store` -> CNAME:
   - Name: `ott` / Target: tu dominio `.onrender.com` / Proxy: **GRIS
     (DNS only)**. Igual que hiciste con `widget` en `DEPLOY_GUIDE.md`.
   - Si la nube queda naranja, Cloudflare fuerza HTTPS y NetCast viejo falla.
3. Verificación: `curl -v http://ott.teamg.store/ott`
   Debe dar `200 OK` con JSON `com.ott.clone.tv`, sin `301/308/Location:`.

## Media Station X en el TV del cliente

- Samsung Tizen / LG WebOS nuevos: Start Parameter `ott.teamg.store/ott`
- LG NetCast viejo: lo mismo pero sin `https://`, solo el host + path:
  `ott.teamg.store/ott`
- TeamG Play sigue con su parámetro de siempre (`widget.teamg.store`).
  Son dos entradas distintas en MSX, dos apps distintas.

## Probar en local

```bash
cd teamg-widget-endpoint
PORT=3999 node server.js
# http://127.0.0.1:3999/        -> JSON TeamG
# http://127.0.0.1:3999/ott     -> JSON OTT TV
# http://127.0.0.1:3999/ott/index.html -> app nueva
```

## Ojo: `public/index.html` tiene marcadores de conflicto git

El archivo trae `<<<<<<< HEAD ... ======= ... >>>>>>>` (líneas 1 y 174),
así que en el TV se ve texto roto. No lo toqué porque es tu app TeamG en
producción. Cuando quieras lo resolvemos eligiendo una de las dos versiones.

## Siguiente mejora (cuando la réplica te convenza)

- PIN de 6 dígitos para vincular TV a lista del servidor (como OTTPlayer).
- EPG con `tvg-url` XMLTV y barra ahora/siguiente.
- Tema oscuro premium sobre este mismo `ott/index.html`.

## Sistema de cuentas (modelo OTTPlayer real)

Flujo: tú creas usuario+password en el panel → cliente se loguea en la tuerca
→ registra su TV (NEW DEVICE con nombre) → tú le asignas listas → cliente
pulsa botón rojo y le aparecen las carpetas.

### Render: Build + variables (obligatorio tras esta versión)

1. Servicio → Settings → **Build Command**: cambia `echo skip-build` por
   `npm install` (ahora hay dependencia `mongodb`).
2. **Environment** → añade:
   - `ADMIN_KEY` = clave que elijas (ej. una larga) → login del panel admin.
   - `MONGODB_URI` = tu connection string de Mongo (puedes reusar el mismo
     cluster de TeamG; usa otra DB con `OTT_DB=ottv`). Sin esto funciona en
     memoria pero se borra al dormirse el servicio.
   - `TOKEN_SECRET` = opcional, otro valor largo.
3. Save → redespliega.

### Panel admin

- URL: `https://ott.teamg.store/admin/` (o `http://` en NetCast viejas).
- Entra con tu ADMIN_KEY. Verás `store: mongo` (o `memory` si falta URI).
- Crea usuario + password → apúntalos para el cliente.
- Agrega tus playlists M3U (+ EPG opcional).
- Cuando el cliente registre su TV, aparece en Dispositivos: marca sus listas,
  Guarda, y dile que pulse el botón rojo.

### TV del cliente

1. Abrir OTT TV → tuerca (o botón verde) → Cuenta: usuario, password,
   nombre del TV (por defecto SamsungTV/LGTV/...) → Guardar y registrar TV.
2. Vuelve al inicio vacío → pulsa botón rojo ⟳ → aparecen sus carpetas.
3. OK en carpeta → grupos/canales como antes.

