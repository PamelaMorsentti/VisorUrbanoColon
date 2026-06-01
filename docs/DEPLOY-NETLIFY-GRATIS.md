# Deploy Gratis en Netlify

Este proyecto puede publicarse gratis en Netlify como sitio estatico (frontend Vite).

## 1. Preparacion local

1. Verifica que compile:

```powershell
pnpm run typecheck
pnpm run build:netlify
```

2. El build final queda en:

- artifacts/colon-3d/dist/public

## 2. Crear el sitio en Netlify

1. Entra a Netlify con tu cuenta.
2. Click en `Add new site` -> `Import an existing project`.
3. Conecta tu repo de GitHub.
4. Usa esta configuracion (si no la detecta automaticamente):

- Build command: `pnpm run build:netlify`
- Publish directory: `artifacts/colon-3d/dist/public`
- Node version: `20`

Nota: Ya existe `netlify.toml` en la raiz, por lo que normalmente Netlify toma esta configuracion solo.

## 3. Variables de entorno

Para publicar gratis sin backend desplegado, no cargues `VITE_API_BASE_URL`.

Comportamiento esperado:

- El frontend funciona con capas y datos estaticos locales.
- Si el API no esta disponible, usa fallback de catalogo externo (ya implementado).

## 4. SPA routing

El archivo `netlify.toml` incluye redirect SPA:

- `/* -> /index.html (200)`

Esto evita errores 404 al refrescar rutas internas.

## 5. Que queda fuera en modo gratis (sin backend)

Estas funciones dependen del API en `:5180` y no estaran activas si no despliegas backend:

- Endpoints `/api/*` (catalogo dinamico DB, QA DB, hidrologia server-side, etc.)

## 6. Opcional: backend gratis mas adelante

Si luego quieres backend gratis, puedes montar API en otro proveedor y definir:

- `VITE_API_BASE_URL = https://tu-api.example.com`

Luego redeploy en Netlify.
