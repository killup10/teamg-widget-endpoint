# TeamG Widget Endpoint

Endpoint JSON dedicado para el widget LG NetCast de TeamG Play via Media Station X.

## 🎯 Propósito

Este proyecto resuelve el problema de configuración del widget TeamG Play en LG NetCast via Media Station X, proporcionando un endpoint JSON puro **sin redirects HTTPS** que los dispositivos LG antiguos no pueden manejar.

## ⚠️ Problema identificado

**Vercel fuerza HTTPS con redirect 308**, lo cual causa problemas en LG NetCast:
```
HTTP/1.0 308 Permanent Redirect
Location: https://widget.teamg.store/
```

## 🚀 Solución: Servidor HTTP puro

### Opción A: Railway Deploy (Recomendado)

Railway permite HTTP sin redirects forzados:

1. **Crear cuenta en Railway.app**
2. **Conectar repositorio GitHub**
3. **Deploy automático**
4. **Configurar dominio personalizado** (opcional)

```bash
# Servidor HTTP simple
node server.js
# → Servidor corriendo en puerto 3000
# → Acepta HTTP sin redirects
```

### Opción B: Servidor local/VPS

```bash
# Clonar repositorio
git clone https://github.com/killup10/teamg-widget-endpoint.git
cd teamg-widget-endpoint

# Instalar dependencias (ninguna requerida)
npm install

# Ejecutar servidor HTTP
npm start
# → http://localhost:3000
```

## 📋 Configuración para LG NetCast

### Si usas Railway:
```
URL: http://teamg-widget-endpoint.up.railway.app
```

### Si usas servidor propio:
```
URL: http://tu-servidor.com:3000
```

### Si usas dominio personalizado:
```
URL: http://widget.teamg.store
```

## 🔧 Características técnicas

- **Servidor HTTP puro** (Node.js nativo)
- **Sin dependencias externas**
- **JSON estático optimizado** para LG NetCast
- **Headers CORS correctos**
- **Sin redirects HTTPS**
- **Compatible con dispositivos antiguos**

## 📱 Uso en Media Station X

**Configuración en LG NetCast:**
1. Abrir Media Station X
2. Settings → Start Parameter → Setup
3. Introducir: `tu-dominio-http.com` (SIN https://)
4. Confirmar configuración

## 🎮 Respuesta JSON

```json
{
  "version": "1.0.0",
  "id": "com.teamg.play.netcast",
  "name": "TeamG Play TV",
  "description": "TeamG Play optimizado para LG NetCast vía Media Station X.",
  "icon": "https://play.teamg.store/netcast/TeamG%20Play.png",
  "homepage": "https://play.teamg.store/netcast/index.html",
  "app": {
    "type": "web",
    "title": "TeamG Play TV",
    "url": "https://play.teamg.store/netcast/index.html",
    "icon": "https://play.teamg.store/netcast/TeamG%20Play.png"
  },
  "startup": {
    "url": "https://play.teamg.store/netcast/index.html"
  },
  "meta": {
    "platform": "LG NetCast",
    "via": "Media Station X",
    "maintainer": "TeamG",
    "timestamp": "2025-08-08T18:30:00.000Z"
  }
}
```

## ✅ Verificación

```bash
# Verificar que NO hay redirect 308
curl -v http://tu-servidor.com

# Debe devolver:
# HTTP/1.1 200 OK (NO 308!)
# Content-Type: application/json
```

## 🏗️ Arquitectura

```
Media Station X (LG NetCast)
    ↓ HTTP (sin HTTPS)
Servidor HTTP puro (Railway/VPS)
    ↓ JSON directo
TeamG Play App → play.teamg.store/netcast/
```

## 📝 Alternativas probadas

- ❌ **Vercel**: Fuerza HTTPS con redirect 308
- ❌ **Netlify**: Fuerza HTTPS con redirect 301
- ❌ **Cloudflare Pages**: Fuerza HTTPS
- ✅ **Railway**: Permite HTTP puro
- ✅ **Render**: Permite HTTP puro
- ✅ **VPS propio**: Control total

## 🚀 Deploy en Railway

1. **Crear cuenta**: https://railway.app
2. **New Project** → **Deploy from GitHub repo**
3. **Seleccionar**: `teamg-widget-endpoint`
4. **Variables de entorno**: No requeridas
5. **Deploy automático**: ✅

**URL generada**: `https://teamg-widget-endpoint.up.railway.app`
**Para HTTP**: Configurar dominio personalizado sin SSL

---

**Mantenido por:** TeamG  
**Plataforma:** Railway / Node.js HTTP Server  
**Compatibilidad:** LG NetCast via Media Station X (HTTP puro)
