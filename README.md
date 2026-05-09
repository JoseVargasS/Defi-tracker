# DeFi & Crypto Terminal

Aplicacion web estatica para consultar balances de wallets, revisar transacciones en Ethereum/Base y seguir pares spot USDT con una grafica de velas estilo exchange.

El proyecto esta construido con HTML, CSS y JavaScript modular sin bundler. Usa Chart.js con `chartjs-chart-financial` para velas, Binance para mercado spot, Etherscan para transacciones de Ethereum y CoinStats para balances/transacciones multired.

## Contenido

- [Caracteristicas](#caracteristicas)
- [Stack](#stack)
- [Estructura](#estructura)
- [Arquitectura](#arquitectura)
- [Grafica de velas](#grafica-de-velas)
- [Wallets y transacciones](#wallets-y-transacciones)
- [Configuracion](#configuracion)
- [Ejecucion local](#ejecucion-local)
- [Verificacion](#verificacion)
- [Convenciones de desarrollo](#convenciones-de-desarrollo)
- [Problemas conocidos](#problemas-conocidos)
- [Roadmap](#roadmap)

## Caracteristicas

- Watchlist de pares Binance `*/USDT`, con lista inicial si no hay pares guardados.
- Busqueda de monedas desde `exchangeInfo` de Binance.
- Actualizacion de precios y variacion 24h por lotes.
- Grafica de velas con:
  - Velas OHLC.
  - Bandas de Bollinger.
  - Volumen en panel inferior.
  - Stoch RSI con lineas `%K` y `%D`.
  - Crosshair con fecha/precio.
  - Barra OHLC superior que no tapa las velas.
  - Etiqueta de precio actual fuera del area de velas.
  - Tags de indicadores en el margen derecho, separados para no sobreponerse.
- Consulta de wallet EVM.
- Guardado de wallets en `localStorage`.
- Balances multired desde CoinStats.
- Historial de transacciones Ethereum/ERC20 y Base.
- Calculo de valor USD actual, valor historico y P&L aproximado por transaccion.
- Interfaz oscura, compacta y orientada a trading.

## Stack

- HTML5.
- CSS3 con imports por dominio.
- JavaScript ES Modules.
- Chart.js.
- `chartjs-adapter-date-fns`.
- `chartjs-chart-financial`.
- APIs:
  - Binance Spot API.
  - Etherscan API v2.
  - CoinStats Open API.

No hay `package.json` ni pipeline de build. La app se sirve como archivos estaticos.

## Estructura

```text
.
|-- index.html
|-- styles.css
|-- README.md
|-- AGENTS.md
|-- js/
|   |-- main.js
|   |-- bootstrap.js     # carga config.local.js antes de main.js
|   |-- state.js
|   |-- config.js
|   |-- config.local.js   # generado localmente, ignorado por git
|   |-- utils.js
|   |-- exchange.js
|   |-- pairs.js
|   |-- chartAdvanced.js
|   |-- wallet.js
|   |-- transactions.js
|   `-- prices.js
|-- styles/
|   |-- general.css
|   |-- forms.css
|   |-- wallet.css
|   |-- crypto.css
|   |-- transactions.css
|   `-- responsive.css
|-- images/
|   |-- Eth-icon-purple.png
|   |-- copy-icon.png
|   |-- search-icon.svg
|   `-- trash-icon.svg
|-- scripts/
|   `-- generate-config.mjs
`-- skills-lock.json
```

## Arquitectura

La aplicacion arranca desde `index.html`, que carga librerias CDN y luego `js/bootstrap.js` como modulo.

### Flujo principal

1. `bootstrap.js` intenta cargar `js/config.local.js`.
2. `main.js` espera `DOMContentLoaded`.
3. Restaura pares guardados desde `localStorage`.
4. Configura defaults globales de Chart.js para velas.
5. Registra listeners de:
   - busqueda de pares,
   - seleccion de intervalos,
   - toggles de indicadores,
   - acciones de wallet,
   - botones de "ver mas" en transacciones.
6. Llama `fetchCoinsList()` para poblar el buscador.
7. Renderiza watchlist con `renderTrackedPairs()`.
8. Inicia actualizacion periodica de precios por lotes.
9. Si hay wallet guardada, la consulta automaticamente.

### Estado compartido

`js/state.js` concentra estado runtime:

- `tracked`: pares seguidos.
- `DEFAULT_TRACKED_PAIRS`: pares iniciales usados cuando no hay watchlist guardada.
- `chartInstance`: instancia Chart.js activa.
- `currentPair`: par abierto en detalle.
- `currentInterval`: intervalo actual.
- `chartZoom`: cantidad de velas visibles.
- `chartView`: configuracion de zoom/pan.
- `chartIndicators`: toggles para Bollinger, volumen y Stoch RSI.
- caches de precios, charts historicos y requests en curso.

Mantener estado comun aqui evita variables globales dispersas.

## Grafica de velas

La grafica vive principalmente en:

- `js/pairs.js`: crea datasets, escalas, plugins visuales, renderiza y maneja zoom/pan.
- `js/chartAdvanced.js`: normaliza klines, calcula indicadores y dibuja tooltip OHLC.
- `js/exchange.js`: trae klines desde Binance y agrega intervalos sinteticos.

### Datos

`fetchKlines(symbol, interval)` consulta:

```text
https://api.binance.com/api/v3/klines
```

Los klines se normalizan a:

```js
{
  x, // timestamp
  o, // open
  h, // high
  l, // low
  c, // close
  v, // base volume
  q  // quote volume
}
```

Para `3M` y `5d`, `exchange.js` agrega velas desde datos Binance y conserva volumen base/quote.

### Indicadores actuales

Los indicadores activos son configurables con `state.chartIndicators`:

```js
chartIndicators: {
  bollinger: true,
  volume: true,
  stochRsi: true
}
```

Datasets generados:

- `candlestick`: precio.
- `BB Upper`, `BB Lower`, `BB Basis`: Bollinger Bands.
- `Volume`: barras con color segun vela alcista/bajista.
- `Stoch RSI %K`, `Stoch RSI %D`: oscilador.
- `Stoch RSI 80`, `Stoch RSI 20`: guias horizontales.

### Plugins visuales

`pairs.js` define:

- `crosshairPlugin`: linea vertical/horizontal y labels de eje.
- `currentPricePlugin`: linea horizontal y etiqueta de precio actual fuera de las velas.
- `indicatorLegendPlugin`: leyendas de volumen y Stoch RSI, mas tags separados en el margen derecho.

`chartAdvanced.js` define:

- `createAdvancedTooltipPlugin()`: barra superior OHLC compacta. Esta barra usa padding superior reservado para no tapar velas.

### Reglas importantes de la grafica

- La etiqueta de precio actual debe quedar fuera del area de velas.
- La barra OHLC no debe flotar encima de las candles.
- Los tags de indicadores deben ir en el margen derecho.
- Si dos tags de Stoch RSI estan cerca, deben separarse automaticamente.
- El padding derecho debe ser solo el necesario para labels/tags, no una franja vacia excesiva.
- Al cambiar un indicador se re-renderiza la grafica con `renderCandlestick()`.

## Wallets y transacciones

### Wallets

`js/wallet.js` gestiona:

- wallets guardadas en `localStorage`,
- fetch de balances por red,
- render del dashboard de assets,
- disparo de carga de transacciones.
- concurrencia limitada para balances multired, sin pausa fija entre redes.

`SUPPORTED_CHAINS` esta en `js/config.js`.

### Transacciones

`js/transactions.js` gestiona dos redes:

```js
ethereum
base-wallet
```

Ethereum:

- Usa Etherscan API v2.
- Pide en paralelo:
  - `tokentx`,
  - `txlist`.
- Convierte transacciones ETH nativas a formato compatible con tokens.
- Deduplica por hash/token/value.

Base:

- Usa CoinStats wallet transactions.
- Primero intenta leer transacciones.
- Solo dispara `PATCH` de sincronizacion si CoinStats responde `409`.
- Hace retry corto despues del sync.
- Renderiza la primera pagina apenas recibe las transacciones.
- Hidrata precio actual, precio historico y P&L en segundo plano con concurrencia limitada.
- No imprime payloads completos ni URLs con `apikey` en consola.

### Precios y P&L

`js/prices.js` consulta CoinStats:

- precio actual por simbolo,
- chart historico por coin id,
- precio historico mas cercano a la fecha de la transaccion.

`transactions.js` usa concurrencia limitada para resolver precios por pagina sin bloquear el primer render. Cada fila aparece con placeholders y se actualiza cuando llegan precio actual, precio historico y P&L.

## Configuracion

Las keys ya no viven en `js/config.js`. Ese archivo solo define defaults publicos y lee overrides desde `globalThis.DEFI_TRACKER_CONFIG`, que se genera localmente en `js/config.local.js`.

Archivos relevantes:

```text
.env                  # local, contiene keys reales, ignorado por git
.env.example          # ejemplo versionable sin secretos
js/config.js          # wrapper sin secretos
js/config.local.js    # generado desde .env, ignorado por git
scripts/generate-config.mjs
```

Crear o actualizar `.env`:

```env
BINANCE_API=https://api.binance.com/api/v3
COINSTATS_API=https://openapiv1.coinstats.app
COINSTATS_API_KEY=replace-me
ETH_API=https://api.etherscan.io/v2/api
ETH_KEY=replace-me
```

Generar el archivo local que el navegador si puede leer:

```powershell
node scripts/generate-config.mjs
```

`index.html` carga `js/bootstrap.js`; ese modulo intenta importar `js/config.local.js` antes de arrancar `js/main.js`. Si no generas ese archivo, Binance seguira funcionando con endpoints publicos, pero CoinStats/Etherscan no tendran API key y la seccion wallet mostrara un aviso de configuracion.

Importante: aunque `.env` y `config.local.js` esten ignorados por git, cualquier key usada desde navegador sigue siendo visible para quien abra la app. Para produccion real, mueve las llamadas con keys a un proxy o funcion serverless.

### Seguridad de navegador

`index.html` incluye una politica CSP basica:

- limita scripts a la app y `cdn.jsdelivr.net`; permite inline por compatibilidad con extensiones de wallet/navegador,
- limita conexiones a Binance, CoinStats y Etherscan,
- bloquea `object-src`,
- permite imagenes HTTPS y assets locales,
- evita enviar `Referer` con `referrer=no-referrer`.

Los datos externos que se renderizan en HTML deben pasar por `escapeHTML()` y las URLs de imagen por `safeImageUrl()`. Los errores visibles al usuario deben pasar por `safeErrorMessage()` para no volcar respuestas externas ni detalles sensibles en el DOM.

## Ejecucion local

Como usa modulos ES, es mejor servirlo por HTTP y no abrir `index.html` directamente.

Opciones:

```powershell
# Si Python esta disponible
python -m http.server 8000
```

```powershell
# Alternativa con Node, sin instalar paquetes
node -e "const http=require('http'),fs=require('fs'),path=require('path');const root=process.cwd();const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'};http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');const rel=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\\/+/, '');const file=path.join(root,rel);fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end('not found');return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(data);});}).listen(8000)"
```

Luego abrir:

```text
http://localhost:8000
```

## Verificacion

No hay test runner configurado. Para smoke checks de sintaxis:

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

Prueba rapida de indicadores:

```powershell
node --input-type=module -e "const m=await import('./js/chartAdvanced.js'); const data=Array.from({length:80},(_,i)=>({x:i,o:100+i,h:104+i,l:98+i,c:101+i,v:1000+i,q:230000+i*20})); console.log(m.calculateVolume(data).at(-1).q, m.calculateStochRSI(data).k.length, m.calculateBollingerBands(data).upper.length);"
```

Verificacion visual recomendada:

- abrir una wallet guardada,
- confirmar que balances aparecen,
- confirmar que transacciones ETH/Base cargan,
- abrir un par,
- mover el mouse sobre la grafica,
- comprobar que la barra OHLC no tapa candles,
- comprobar que tags de precio/Stoch RSI no se sobreponen,
- probar toggles `BB`, `VOL`, `Stoch RSI`,
- probar zoom con rueda y pan con drag.

## Convenciones de desarrollo

- Mantener JavaScript como ES Modules.
- No introducir bundler si no es necesario.
- Usar `state.js` para estado compartido.
- Mantener helpers tecnicos de grafica en `chartAdvanced.js`.
- Mantener plugins/render de Chart.js en `pairs.js`.
- Evitar reescribir DOM con strings enormes si se puede usar fragmentos, salvo en tablas ya existentes.
- Evitar delays artificiales en balances y transacciones. Preferir cache, deduplicacion y concurrencia limitada.
- No loguear URLs con `apikey`, headers, direcciones completas con payloads externos ni respuestas completas de APIs.
- Si se agrega contenido dinamico con `innerHTML`, escapar textos con `escapeHTML()` y validar URLs con `safeImageUrl()`.
- No dejar codigo comentado muerto ni secciones "eliminadas".
- Si se agrega un indicador:
  - calcularlo en `chartAdvanced.js`,
  - agregar dataset en `buildDatasets()`,
  - agregar escala si necesita panel,
  - agregar leyenda/tag si aplica,
  - agregar toggle en `index.html` y estado en `state.js`.

## Problemas conocidos

- Las API keys ya no estan en archivos versionables, pero si se usan en navegador siguen siendo visibles en runtime.
- La CSP ayuda a reducir XSS, pero no reemplaza escapar datos externos antes de renderizar.
- CoinStats puede responder `429` o `409`. El codigo intenta reducir bursts con caches y concurrencia limitada.
- Algunos iconos de tokens dependen de URLs externas y pueden fallar.
- La app depende de CDN para Chart.js; sin internet no renderiza la grafica.
- No hay tests automatizados ni CI.

## Roadmap

- Agregar `package.json` con scripts `start`, `check` y futuro `test`.
- Mover llamadas con API keys a proxy/serverless.
- Agregar tests unitarios para indicadores y normalizacion de transacciones.
- Agregar persistencia de preferencias de indicadores/intervalo.
- Agregar mas indicadores: EMA, VWAP, MACD, RSI clasico.
- Mejorar fallback de iconos por simbolo.
- Agregar skeletons de carga para transacciones y grafica.
- Agregar modo responsive dedicado para mobile trading.
