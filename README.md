# TeamG Widget Endpoint

Micro-servicio dedicado para servir JSON en `widget.teamg.store` para LG NetCast via Media Station X.

## Problema que resuelve

Media Station X en LG NetCast no puede seguir redirects ni manejar caracteres especiales como `/`. Necesita un endpoint que devuelva JSON puro con status 200 OK directamente en la raíz del dominio.

## Arquitectura

- **Edge Function**: Respuesta ultra-rápida (<50ms)
- **Proxy inteligente**: Hace fetch a `play.teamg.store/netcast/start.json`
- **Fallback robusto**: JSON de respaldo si el origen falla
- **Headers correctos**: `Content-Type: application/json` + CORS

## Estructura

```
teamg-widget-endpoint/
├── api/
│   └── index.js          # Edge Function principal
├── vercel.json           # Configuración de routing
├── package.json          # Metadatos del proyecto
└── README.md            # Esta documentación
```

## Deploy

1. Conectar repo a Vercel
2. Asignar dominio `widget.teamg.store` a este proyecto
3. Verificar: `curl -I https://widget.teamg.store`

## Resultado esperado

```
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Access-Control-Allow-Origin: *
Cache-Control: public, max-age=3600
```

## Mantenimiento

- **Sin dependencias**: Solo Edge Function nativa
- **Auto-actualización**: Siempre sirve el JSON más reciente del origen
- **Monitoreo**: Logs automáticos en Vercel Dashboard
