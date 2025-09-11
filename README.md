# DEFI-Tracker

> Documentación completa para el proyecto **DEFI-Tracker** (README.md en español).

---

## Tabla de contenidos

1. [Resumen del proyecto](#resumen-del-proyecto)
2. [Características principales](#caracter%C3%ADsticas-principales)
3. [Demo / capturas (placeholders)](#demo--capturas-placeholders)
4. [Stack tecnológico](#stack-tecnol%C3%B3gico)
5. [Estructura de archivos](#estructura-de-archivos)
6. [Descripción archivo por archivo](#descripci%C3%B3n-archivo-por-archivo)
7. [Configuración y variables de entorno](#configuraci%C3%B3n-y-variables-de-entorno)
8. [Inicio rápido — Desarrollo local](#inicio-r%C3%A1pido--desarrollo-local)
9. [Arquitectura y flujo de datos](#arquitectura-y-flujo-de-datos)
10. [Problemas comunes y troubleshooting](#problemas-comunes-y-troubleshooting)
11. [Consideraciones de seguridad](#consideraciones-de-seguridad)
12. [Testing](#testing)
13. [Despliegue](#despliegue)
14. [Guía de contribución](#gu%C3%ADa-de-contribuci%C3%B3n)
15. [Roadmap & mejoras sugeridas](#roadmap--mejoras-sugeridas)
16. [Licencia & contacto](#licencia--contacto)

---

## Resumen del proyecto

**DEFI-Tracker** es una aplicación web estática y ligera para monitorizar tokens DeFi y carteras (wallets). Está construida con HTML, CSS y JavaScript (ES6 modules) y obtiene precios y datos de APIs externas. El propósito es ofrecer un tablero sencillo para consultar balances, precios y guardar direcciones de wallet en `localStorage`.

---

## Características principales

- Interfaz SPA (single-page) estática.
- Búsqueda de tokens por símbolo/contrato y consulta de precio.
- Guardado de wallets en `localStorage` y renderizado rápido.
- Módulos JavaScript separados (`utils`, `prices`, `wallet`, `app`).
- Diseño responsive básico.

---

## Demo / capturas (placeholders)

Sustituye estas rutas por imágenes reales en `images/` si quieres mostrar capturas en el README:

- `images/screenshot-dashboard.png` — vista principal con lista de tokens y wallets.
- `images/screenshot-search.png` — panel de búsqueda de tokens.

---

## Stack tecnológico

- HTML5
- CSS3
- JavaScript (ES6 modules, `fetch`, `async/await`)
- Opcional: servidor estático simple para desarrollo (Python `http.server`, `serve` npm)

---

## Estructura de archivos

```
Defi-tracker/
├─ images/           # capturas y assets
├─ js/               # módulos JS
│  ├─ app.js         # entrada principal y lógica UI
│  ├─ utils.js       # utilidades (fetch wrapper, formateo, debounce)
│  ├─ prices.js      # consultas a APIs de precios
│  └─ wallet.js      # manejo de wallets y localStorage
├─ index.html        # página principal
├─ styles.css        # estilos globales
└─ README.md         # este archivo
```

---

## Descripción archivo por archivo

### `index.html`

- Punto de entrada de la aplicación.
- Debe contener la estructura del layout: header, formulario de búsqueda, lista de resultados y sección de wallets guardadas.
- Incluir `styles.css` y los módulos JS (`<script type="module" src="js/app.js"></script>`).
- Mejora recomendada: añadir etiquetas meta (`viewport`) y roles ARIA para accesibilidad.

### `styles.css`

- Estilos globales y componentes UI.
- Mejora recomendada: usar variables CSS (`--color-primary`, `--gap`) para facilitar temas y mantenibilidad.

### `js/app.js`

- Orquesta la aplicación: registra listeners, valida inputs, llama a `prices.js` y `wallet.js`, y renderiza en DOM.
- Añade manejo de errores y estados (loading, empty, error).

### `js/utils.js`

- Helpers reutilizables: `makeRequest(url, opts)`, `formatCurrency(value)`, `debounce(fn, ms)`.
- `makeRequest` debería manejar errores HTTP, parseo JSON y lanzar errores amigables.

### `js/prices.js`

- Funciones para obtener precios: p. ej. `getTokenPriceByContract(contract)` y `getTokenPriceUSD(symbol)`.
- Considerar backoff/reintentos y caché temporal (TTL) para evitar límites de API.

### `js/wallet.js`

- Gestión de wallets guardadas: `getSavedWallets()`, `saveWallet(addr)`, `removeWallet(addr)`, `renderSavedWallets(container)`.
- Función `fetchAndRenderWallet(addr)` para obtener balances y mostrar resumen.

---

## Configuración y variables de entorno

Crea `js/config.js` basado en `js/config.example.js` (NO incluir keys reales en el repo):

```js
// js/config.example.js
export const ETH_API = "https://api.ejemplo.com";
export const ETH_KEY = "<TU_API_KEY_AQUI>";
```

Añade `js/config.js` a `.gitignore` si usas keys locales. Para despliegues públicos, usa funciones serverless o un proxy para no exponer keys en cliente.

---

## Inicio rápido — Desarrollo local

### Requisitos

- Node.js (opcional) o Python para servidor estático.

### Servir estático rápido

Con Python (desde la raíz del proyecto):

```bash
python -m http.server 8080
# Abrir http://localhost:8080
```

Con `serve` (npm):

```bash
npm i -g serve
serve . -l 8080
```

Recomendación: añadir un `package.json` con script `start`:

```json
{
  "scripts": {
    "start": "serve . -l 8080"
  }
}
```

---

## Arquitectura y flujo de datos

1. El usuario introduce un símbolo de token o una dirección de wallet.
2. `app.js` valida y despacha la petición a `prices.js` o `wallet.js`.
3. `prices.js` consulta la API externa y devuelve JSON con el precio.
4. `app.js` renderiza los resultados en el DOM.
5. Wallets guardadas se mantienen en `localStorage` y se re-renderizan al cargar la página.

---

## Problemas comunes y troubleshooting

- **400 Bad Request (API)**: revisa parámetros de consulta y que la API key sea válida.
- **CORS**: muchas APIs bloquean peticiones desde el navegador. Usa un proxy o función serverless.
- **Errores tipo `res is not defined`**: revisar el scope de variables y el uso de `await/async` — envolver en `try/catch`.
- **Requests lentos**: implementar debounce en inputs y cache de resultados con TTL.

---

## Consideraciones de seguridad

- No cometas API keys ni secretos.
- Valida y sanitiza inputs del usuario.
- Para operaciones sensibles o con claves, hazlas en el servidor.
- Añade límites y validaciones si aceptas direcciones públicas para evitar abusos.

---

## Testing

- Añade pruebas unitarias para utilidades (`utils.js`) con Jest o Vitest.
- Pruebas E2E/smoke con Playwright o Puppeteer: flujos como búsqueda de token, guardado de wallet y renderizado.

---

## Despliegue

Opciones sencillas:

- **GitHub Pages**: habilita Pages en el repositorio.
- **Netlify / Vercel**: conectar el repo y desplegar como sitio estático.
- Para claves/secretos, usa variables de entorno del proveedor o funciones serverless.

---

## Guía de contribución

- Mantén PRs pequeños y con foco único.
- Incluye capturas de pantalla para cambios de UI.
- Agrega tests para nuevas utilidades.
- Sigue un estilo (ESLint / Prettier recomendado).

---

## Roadmap & mejoras sugeridas

- Historial de transacciones y parsing de eventos on-chain.
- Integración de varias fuentes de precio con fallback ponderado.
- Tema claro/oscuro y mejor responsividad.
- Migración a framework ligero (React, Svelte) si la UI crece.
- CI: pruebas automáticas y deploy (GitHub Actions).

---
