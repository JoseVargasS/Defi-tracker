# AGENTS.md

Guia para agentes que trabajen en este repositorio.

## Objetivo del proyecto

Este repo es una app web estatica llamada **DeFi & Crypto Terminal**. Sirve para:

- consultar balances de wallets,
- listar transacciones Ethereum/Base,
- seguir pares Binance `*/USDT`,
- visualizar velas con indicadores tecnicos.

No hay backend local ni bundler. Todo corre en navegador con HTML, CSS y JavaScript ES Modules.

## Comandos utiles

Ejecutar desde la raiz del repo:

```powershell
node --check js/main.js
node --check js/pairs.js
node --check js/chartAdvanced.js
node --check js/exchange.js
node --check js/wallet.js
node --check js/transactions.js
node --check js/prices.js
```

Servidor local recomendado:

```powershell
python -m http.server 8000
```

Si Python no esta disponible, usar un servidor estatico simple con Node.

## Mapa de archivos

```text
index.html                UI base y scripts CDN
styles.css                Importa todos los CSS
styles/general.css        Layout global, fuente, header, grid principal
styles/forms.css          Inputs, botones, sugerencias
styles/wallet.css         Panel wallet y balances
styles/crypto.css         Watchlist, panel de mercado, chart
styles/transactions.css   Tablas/listas de transacciones
styles/responsive.css     Breakpoints
js/bootstrap.js           Carga config local opcional antes de la app
js/main.js                Arranque DOM, listeners, polling
js/state.js               Estado compartido y caches
js/config.js              Endpoints publicos y lectura de config local
js/config.local.js        Generado desde .env, ignorado por git
scripts/generate-config.mjs Genera js/config.local.js
js/utils.js               Fetch wrapper y formateo basico
js/exchange.js            Binance prices/stats/klines/exchangeInfo
js/pairs.js               Watchlist y render Chart.js
js/chartAdvanced.js       Indicadores y tooltip OHLC
js/wallet.js              Wallet guardada, balances, dashboard
js/transactions.js        Fetch/render transacciones
js/prices.js              Precios actuales e historicos
```

## Reglas de edicion

- Usar ASCII en archivos nuevos o reemplazados, salvo que el archivo ya requiera otra codificacion.
- Mantener ES Modules: `import`/`export`.
- No introducir framework ni bundler sin una razon clara.
- No dejar codigo muerto comentado.
- No revertir cambios no relacionados.
- Usar `apply_patch` para ediciones manuales.
- Si cambias UI, revisar `styles/responsive.css`.
- Si cambias la grafica, revisar `pairs.js`, `chartAdvanced.js` y `state.js` juntos.

## Grafica de velas

La grafica esta en `js/pairs.js`.

Funciones/piezas clave:

- `buildTechnicalSeries(data)`: calcula Bollinger, volumen y Stoch RSI.
- `buildDatasets(symbol, candles, series)`: crea datasets Chart.js.
- `createScales(interval)`: define escalas/paneles.
- `renderCandlestick(symbol, interval)`: fetch, normaliza, renderiza y registra zoom/pan.
- `crosshairPlugin`: crosshair y etiquetas de eje.
- `currentPricePlugin`: etiqueta de precio actual en margen derecho.
- `indicatorLegendPlugin`: datos visibles de volumen y Stoch RSI.

Calculos en `js/chartAdvanced.js`:

- `normalizeKline(kline)`
- `calculateVolume(data)`
- `calculateBollingerBands(data)`
- `calculateStochRSI(data)`
- `createAdvancedTooltipPlugin()`

### Reglas visuales obligatorias

- La barra OHLC no debe tapar velas.
- La etiqueta de precio actual debe estar fuera del area de velas, en el margen derecho.
- Los tags de indicadores deben estar en el margen derecho.
- Tags de indicadores no deben sobreponerse entre si.
- Valores y numeros deben usar `Inter`, peso normal cuando sea solicitado, y numeros legibles.
- Evitar padding derecho excesivo: solo reservar lo necesario para labels/tags.

## Transacciones

`js/transactions.js` esta optimizado para no cargar fila por fila de forma lenta:

- usar `TX_PAGE_SIZE`,
- usar `PRICE_CONCURRENCY`,
- usar `mapWithConcurrency()`,
- reutilizar caches de `prices.js`,
- evitar delays artificiales,
- renderizar filas antes de esperar precios historicos,
- hidratar USD/P&L en segundo plano.

No reintroducir esperas largas como `await delay(4000)` para transacciones.

Ethereum:

- `tokentx` y `txlist` se piden con `Promise.allSettled`.
- Las transacciones nativas ETH se normalizan al estilo token.
- Se deduplica antes de ordenar.

Base:

- Primero intenta GET.
- Si CoinStats responde `409`, dispara PATCH de sync y reintenta.

## Precios

`js/prices.js` usa caches en `state`:

- `pricesCache`
- `historicalChartCache`
- `coinLookupCache`
- `loadingRequests`

Si se cambia `getHistoricalTokenPriceUSD`, debe retornar explicitamente el precio historico o `null`.

## Estado

Preferir agregar estado compartido en `js/state.js`.

Campos importantes:

- `tracked`
- `DEFAULT_TRACKED_PAIRS`
- `chartInstance`
- `currentPair`
- `currentInterval`
- `chartZoom`
- `chartView`
- `chartIndicators`
- caches de precio/historico

## CSS

La UI actual busca una estetica compacta tipo exchange.

- `styles/crypto.css` contiene la mayoria de la UI de mercado.
- Evitar cards anidadas innecesarias.
- Mantener border radius bajo, usualmente `6px` a `8px`.
- No usar gradientes decorativos grandes.
- Mantener densidad alta y buena legibilidad.
- Revisar mobile en `styles/responsive.css`.

## APIs y seguridad

`js/config.js` no debe contener API keys. Las keys viven en `.env`, que esta ignorado por git, y se inyectan al navegador generando `js/config.local.js`.

Flujo local:

```powershell
copy .env.example .env
node scripts/generate-config.mjs
```

No commitear:

- `.env`
- `.env.*`
- `js/config.local.js`

Si se prepara deploy real:

- mover llamadas con keys a proxy/serverless,
- no llamar APIs con secretos desde navegador,
- actualizar README.

Reglas de seguridad en codigo:

- no insertar datos externos en `innerHTML` sin `escapeHTML()`,
- validar URLs de iconos con `safeImageUrl()`,
- mostrar errores con `safeErrorMessage()`,
- no loguear URLs con `apikey`, headers, payloads completos ni respuestas completas de APIs,
- mantener la CSP de `index.html` sincronizada si se agregan nuevos dominios,
- la CSP permite `unsafe-inline` en `script-src` por compatibilidad con extensiones de wallet; no agregar scripts inline propios,
- mantener `index.html` apuntando a `js/bootstrap.js`, no directo a `main.js`, para respetar la carga previa de config,
- preferir `replaceChildren()`, `textContent` y nodos DOM para UI con datos no confiables.

## Verificacion antes de finalizar

Minimo:

```powershell
node scripts/generate-config.mjs
node --check js/main.js
node --check js/pairs.js
node --check js/chartAdvanced.js
node --check js/exchange.js
node --check js/wallet.js
node --check js/transactions.js
node --check js/prices.js
```

Si se toca grafica:

- abrir un par,
- mover mouse por la grafica,
- comprobar que OHLC, precio actual y tags de indicadores no tapen velas/lineas,
- probar toggles,
- probar zoom/pan.

Si se toca transacciones:

- probar wallet con actividad Ethereum,
- probar wallet con Base si hay datos,
- revisar que el primer render no quede bloqueado por precios historicos lentos,
- confirmar que los placeholders de USD/P&L se actualizan sin duplicar filas.
