// Configuración
const BINANCE_API = 'https://api.binance.com/api/v3';
const COINSTATS_API = 'https://openapiv1.coinstats.app';
const COINSTATS_API_KEY = 'zaahGoIVFiB69a4tlS5jIchyt+YYNNmMW4cdw0Lcto0=';
const ETH_API = 'https://api.etherscan.io/api';
const ETH_KEY = 'F7F8ZYHRFCQU3CC3H8R15A5E3NN5GH1CU4';
const HTX_API = 'https://api.huobi.pro';

// Variables globales
let tracked = [];
let chartInstance = null;
let currentPair = null;
let currentInterval = '1d';
let chartZoom = 60;
let lastPrices = {};
let coinIcons = {};
const pricesCache = {};
const historicalChartCache = {};
const coinLookupCache = {};
let candleRenderLock = false; // evita reentradas concurrentes al renderizar velas

// --------- Crosshair plugin (Chart.js) ----------
const crosshairPlugin = {
  id: 'crosshair',
  afterInit(chart) {
    if (!chart.canvas) return;
    chart.crosshair = { x: null, y: null, snapIndex: null };
    const moveListener = function (e) {
      if (!chart.canvas) return;
      const rect = chart.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      let minDist = Infinity;
      let snapIndex = null;
      let snapX = mouseX;
      if (chart.data.datasets && chart.data.datasets[0] && chart.data.datasets[0].data) {
        chart.data.datasets[0].data.forEach((d, i) => {
          const xPx = chart.scales.x.getPixelForValue(d.x);
          const dist = Math.abs(mouseX - xPx);
          if (dist < minDist) {
            minDist = dist;
            snapIndex = i;
            snapX = xPx;
          }
        });
      }
      chart.crosshair.x = snapX;
      chart.crosshair.y = mouseY;
      chart.crosshair.snapIndex = snapIndex;
      chart.draw();
    };
    const leaveListener = function () {
      chart.crosshair.x = null;
      chart.crosshair.y = null;
      chart.crosshair.snapIndex = null;
      chart.draw();
    };
    chart.canvas.addEventListener('mousemove', moveListener);
    chart.canvas.addEventListener('mouseleave', leaveListener);
    chart.crosshair.moveListener = moveListener;
    chart.crosshair.leaveListener = leaveListener;
  },
  beforeDestroy(chart) {
    if (chart.canvas && chart.crosshair) {
      chart.canvas.removeEventListener('mousemove', chart.crosshair.moveListener);
      chart.canvas.removeEventListener('mouseleave', chart.crosshair.leaveListener);
    }
  },
  afterDraw(chart) {
    if (chart.crosshair && chart.crosshair.x !== null && chart.crosshair.y !== null) {
      const ctx = chart.ctx;
      ctx.save();
      ctx.strokeStyle = '#45B26B';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(chart.crosshair.x, chart.chartArea.top);
      ctx.lineTo(chart.crosshair.x, chart.chartArea.bottom);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(chart.chartArea.left, chart.crosshair.y);
      ctx.lineTo(chart.chartArea.right, chart.crosshair.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Y label
      let yValue = chart.scales.y.getValueForPixel(chart.crosshair.y);
      let yLabel = (yValue !== undefined && yValue !== null && !isNaN(yValue)) ? yValue.toFixed(4) : '';
      if (yLabel) {
        ctx.font = '12px Inter, Arial';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        const labelWidth = ctx.measureText(yLabel).width + 18;
        const labelHeight = 24;
        let boxX = chart.crosshair.x - labelWidth / 2;
        let boxY = chart.crosshair.y - labelHeight - 8;
        if (boxX < chart.chartArea.left) boxX = chart.chartArea.left + 2;
        if (boxX + labelWidth > chart.chartArea.right) boxX = chart.chartArea.right - labelWidth - 2;
        if (boxY < chart.chartArea.top) boxY = chart.crosshair.y + 8;
        ctx.fillStyle = '#23262F';
        ctx.strokeStyle = '#45B26B';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(boxX, boxY, labelWidth, labelHeight, 7);
        else ctx.rect(boxX, boxY, labelWidth, labelHeight);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#F4F4F4';
        ctx.fillText(yLabel, boxX + labelWidth / 2, boxY + labelHeight / 2);
      }

      // X label
      let xValue = null;
      if (chart.crosshair.snapIndex !== null && chart.data.datasets && chart.data.datasets[0] && chart.data.datasets[0].data) {
        const d = chart.data.datasets[0].data[chart.crosshair.snapIndex];
        xValue = d.x;
      } else {
        xValue = chart.scales.x.getValueForPixel(chart.crosshair.x);
      }
      if (xValue) {
        const date = new Date(xValue);
        let dateLabel = '';
        let interval = window.currentInterval || '1d';
        if (interval === '1d' || interval === '3d') {
          dateLabel = date.toLocaleDateString();
        } else if (['4h', '1h', '15m', '5m', '1m', '3d'].includes(interval)) {
          const day = String(date.getDate()).padStart(2, '0');
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const year = date.getFullYear();
          const hour = String(date.getHours()).padStart(2, '0');
          const min = String(date.getMinutes()).padStart(2, '0');
          dateLabel = `${day}/${month}/${year} ${hour}:${min}`;
        } else {
          dateLabel = date.toLocaleString();
        }
        ctx.font = '12px Inter, Arial';
        ctx.textBaseline = 'top';
        ctx.textAlign = 'center';
        const labelWidth = ctx.measureText(dateLabel).width + 16;
        const labelHeight = 22;
        let xBoxX = chart.crosshair.x - labelWidth / 2;
        if (xBoxX + labelWidth > chart.width) xBoxX = chart.width - labelWidth - 6;
        if (xBoxX < 0) xBoxX = 6;
        let xBoxY = chart.chartArea.bottom + 6;
        if (xBoxY + labelHeight > chart.height) xBoxY = chart.chartArea.bottom - labelHeight - 6;
        ctx.fillStyle = '#23262F';
        ctx.strokeStyle = '#45B26B';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(xBoxX, xBoxY, labelWidth, labelHeight, 6);
        else ctx.rect(xBoxX, xBoxY, labelWidth, labelHeight);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#F4F4F4';
        ctx.fillText(dateLabel, xBoxX + labelWidth / 2, xBoxY + 11);
      }
      ctx.restore();
    }
  }
};

// --------- Utilidades ----------
function formatPrice(price) {
  price = parseFloat(price);
  if (isNaN(price)) return '-';
  return price < 1 ? price.toFixed(4) : price.toFixed(2);
}
function fmt(n, d = 2) {
  return Number(n).toLocaleString('en', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function showMessage(el, msg, type = 'info') {
  el.innerHTML = `<div class="msg ${type}">${msg}</div>`;
}

// Custom tokens (ejemplos)
const customTokens = [
  { address: '0x6d6f697e34145bb95c54e77482d97cc261dc237e', symbol: 'USUAL', decimals: 18 },
  { address: '0x430EF9263E76DAE63C84292C3409D61c598E9682', symbol: 'USUALX', decimals: 18 },
  { address: '0x6fC2107235CA4ed3c5bF5bE1b8b2A6eA6A1eA0C2', symbol: 'USD0', decimals: 18 }
];

// --------- Peticiones con manejo de headers ----------
async function makeRequest(url, options = {}) {
  try {
    const headers = { 'Accept': 'application/json', ...(options.headers || {}) };
    if (url.startsWith(COINSTATS_API)) headers['X-API-KEY'] = COINSTATS_API_KEY;
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${res.statusText} ${txt}`);
    }
    const data = await res.json().catch(() => null);
    return data;
  } catch (err) {
    console.error('makeRequest error', url, err);
    throw err;
  }
}

// --------- CoinStats: precio actual y búsqueda genérica ----------
async function getTokenPriceUSD(symbol) {
  try {
    if (!symbol) return null;
    const key = `price-${symbol.toUpperCase()}`;
    if (pricesCache[key]) return pricesCache[key];

    const url = `${COINSTATS_API}/coins?symbol=${encodeURIComponent(symbol)}&currency=USD`;
    const res = await makeRequest(url);
    if (res && Array.isArray(res.result) && res.result.length) {
      const coin = res.result.find(c => (c.symbol || '').toUpperCase() === symbol.toUpperCase()) || res.result[0];
      if (coin && typeof coin.price === 'number') {
        pricesCache[key] = coin.price;
        if (coin.id) coinLookupCache[symbol.toUpperCase()] = coin.id;
        return coin.price;
      }
    }

    if (symbol.toUpperCase() === 'USD0') {
      pricesCache[key] = 1;
      return 1;
    }

    try {
      const url2 = `${COINSTATS_API}/coins/${encodeURIComponent(symbol.toLowerCase())}?currency=USD`;
      const r2 = await makeRequest(url2);
      if (r2 && typeof r2.price === 'number') {
        pricesCache[key] = r2.price;
        if (r2.id) coinLookupCache[symbol.toUpperCase()] = r2.id;
        return r2.price;
      }
    } catch (e) { /* ignore */ }

    return null;
  } catch (err) {
    console.error('getTokenPriceUSD error', symbol, err);
    return null;
  }
}

// --------- Precio histórico aproximado (CoinStats charts, fallback Dexscreener) ----------
async function getHistoricalTokenPriceUSD(symbol, date) {
  try {
    if (!symbol || !date) return null;
    const cacheKey = `${symbol.toUpperCase()}-${Math.floor(date.getTime() / 1000 / 3600)}`;
    if (pricesCache[cacheKey]) return pricesCache[cacheKey];

    let coinId = coinLookupCache[symbol.toUpperCase()];
    if (!coinId) {
      try {
        const q = `${COINSTATS_API}/coins?symbol=${encodeURIComponent(symbol)}&currency=USD`;
        const r = await makeRequest(q);
        if (r && Array.isArray(r.result) && r.result.length) {
          const coin = r.result.find(c => (c.symbol || '').toUpperCase() === symbol.toUpperCase()) || r.result[0];
          if (coin && coin.id) {
            coinId = coin.id;
            coinLookupCache[symbol.toUpperCase()] = coinId;
          }
        }
      } catch (e) { /* ignore */ }
    }

    if (coinId) {
      if (!historicalChartCache[coinId]) {
        try {
          const chartsUrl = `${COINSTATS_API}/coins/${encodeURIComponent(coinId)}/charts?period=all&currency=USD`;
          const chartData = await makeRequest(chartsUrl);
          if (Array.isArray(chartData) && chartData.length) {
            historicalChartCache[coinId] = chartData.map(c => ({ ts: c[0], price: c[1] }));
          } else historicalChartCache[coinId] = [];
        } catch (e) {
          historicalChartCache[coinId] = [];
        }
      }
      const list = historicalChartCache[coinId];
      if (list && list.length) {
        const target = Math.floor(date.getTime() / 1000);
        let best = null, bestDiff = Infinity;
        for (const p of list) {
          const diff = Math.abs(p.ts - target);
          if (diff < bestDiff) { bestDiff = diff; best = p; }
        }
        if (best && typeof best.price === 'number') {
          pricesCache[cacheKey] = best.price;
          return best.price;
        }
      }
    }

    // Fallback for contract addresses
    if (/^0x[a-fA-F0-9]{40}$/.test(symbol)) {
      try {
        const pairRes = await makeRequest(`https://api.dexscreener.com/latest/dex/tokens/${symbol}`);
        if (pairRes && pairRes.pairs && pairRes.pairs.length) {
          const pair = pairRes.pairs[0];
          const pairAddr = pair.pairAddress || pair.address || null;
          if (pairAddr) {
            const ts = Math.floor(date.getTime() / 1000);
            const from = ts - 60 * 60 * 3;
            const to = ts + 60 * 60 * 3;
            const candlesRes = await makeRequest(`https://api.dexscreener.com/latest/dex/pairs/ethereum/${pairAddr}/candles?interval=1h&from=${from}&to=${to}`);
            if (candlesRes && candlesRes.candles && candlesRes.candles.length) {
              let minDiff = Infinity, price = null;
              for (const c of candlesRes.candles) {
                const diff = Math.abs(c.timestamp * 1000 - date.getTime());
                if (diff < minDiff) { minDiff = diff; price = c.close; }
              }
              if (price) {
                pricesCache[cacheKey] = parseFloat(price);
                return parseFloat(price);
              }
            }
          }
        }
      } catch (e) { /* ignore */ }
    }

    return null;
  } catch (err) {
    console.error('getHistoricalTokenPriceUSD error', symbol, err);
    return null;
  }
}

// --------- Binance / HTX helpers (candles, price, 24h) ----------
async function fetch24hStats(symbol) {
  if (symbol === 'CTXCUSDT') {
    try {
      const res = await makeRequest(`${HTX_API}/market/detail?symbol=ctxcusdt`);
      if (!res.tick) return {};
      return {
        priceChange: (res.tick.close - res.tick.open).toFixed(6),
        priceChangePercent: ((res.tick.close - res.tick.open) / res.tick.open * 100).toFixed(2),
        highPrice: res.tick.high,
        lowPrice: res.tick.low,
        volume: res.tick.amount,
        quoteVolume: res.tick.vol,
      };
    } catch {
      return {};
    }
  }
  try {
    const res = await makeRequest(`${BINANCE_API}/ticker/24hr?symbol=${symbol}`);
    return res;
  } catch {
    return {};
  }
}
async function fetchPrice(symbol) {
  if (symbol === 'CTXCUSDT') {
    try {
      const res = await makeRequest(`${HTX_API}/market/detail/merged?symbol=ctxcusdt`);
      return res.tick && res.tick.close ? res.tick.close : '0.00';
    } catch {
      return '0.00';
    }
  }
  try {
    const res = await makeRequest(`${BINANCE_API}/ticker/price?symbol=${symbol}`);
    return res.price;
  } catch {
    return '0.00';
  }
}
async function fetchHTXCandles(symbol, interval) {
  const map = { '1d': '1day', '3d': '3day', '4h': '4hour', '1h': '60min', '15m': '15min', '5m': '5min', '1m': '1min' };
  const period = map[interval] || '1day';
  const res = await makeRequest(`${HTX_API}/market/history/kline?period=${period}&size=500&symbol=ctxcusdt`);
  const data = res;
  return (data.data || []).reverse();
}

// --------- UI helpers: createPairHtml, renderTrackedPairs, add/remove ----------
function getCoinName(symbol) {
  const base = symbol.replace('USDT', '').toUpperCase();
  const names = { BTC: 'BTC', ETH: 'ETH', USDT: 'Tether', BNB: 'BNB', SOL: 'Solana', ADA: 'Cardano', XRP: 'XRP', DOGE: 'Dogecoin', MATIC: 'Polygon', TRX: 'TRON', LINK: 'Chainlink', LTC: 'Litecoin', DOT: 'Polkadot', SHIB: 'Shiba Inu', USDC: 'USD Coin', AVAX: 'Avalanche', OP: 'Optimism', ARB: 'Arbitrum', PEPE: 'Pepe' };
  return names[base] || base;
}

function createPairHtml(symbol, price, stats) {
  const base = symbol.replace('USDT', '');
  let change = '', changeClass = '', changeIcon = '';
  if (stats && stats.priceChangePercent !== undefined) {
    const pct = parseFloat(stats.priceChangePercent);
    change = pct.toFixed(2) + '%';
    changeClass = pct > 0 ? 'positive' : (pct < 0 ? 'negative' : '');
    changeIcon = pct > 0 ? '<span class="arrow-up" style="vertical-align:middle;">▲</span>' : (pct < 0 ? '<span class="arrow-down" style="vertical-align:middle;">▼</span>' : '');
  }
  lastPrices[symbol] = price;
  const source = symbol === 'CTXCUSDT' ? 'HTX' : 'Binance';
  const sourceUrl = source === 'HTX' ? 'https://www.htx.com/' : 'https://www.binance.com/';
  let infoHtml = `<div class="coin-info">
    <span class="coin-name">${getCoinName(symbol)}</span>
    <span class="coin-symbol">${base}/USDT <a class="pair-source-link" href="${sourceUrl}" target="_blank">${source}</a></span>
  </div>`;
  const html = `<div class="tracked-pair" data-symbol="${symbol}">
    ${infoHtml}
    <span class="pair-price" data-symbol="${symbol}">${formatPrice(price)}</span>
    <span class="pair-change ${changeClass}" data-symbol="${symbol}">${changeIcon}${change}</span>
    <button class="delete-btn" onclick="event.stopPropagation();window.removeTrackedPair && window.removeTrackedPair('${symbol}')" title="Eliminar">✕</button>
  </div>`;
  const html = `<div class=\"tracked-pair\" data-symbol=\"${symbol}\">\n    ${infoHtml}\n    <span class=\"pair-price\" data-symbol=\"${symbol}\">${formatPrice(price)}</span>\n    <span class=\"pair-change ${changeClass}\" data-symbol=\"${symbol}\">${changeIcon}${change}</span>\n    <button class=\"delete-btn\" onclick=\"event.stopPropagation();window.removeTrackedPair && window.removeTrackedPair('${symbol}')\" title=\"Eliminar\">\n      <svg width=\"20\" height=\"20\" viewBox=\"0 0 20 20\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n        <path d=\"M5 6.5V15.5C5 16.3284 5.67157 17 6.5 17H13.5C14.3284 17 15 16.3284 15 15.5V6.5\" stroke=\"#aaa\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>\n        <path d=\"M3 6.5H17\" stroke=\"#aaa\" stroke-width=\"1.5\" stroke-linecap=\"round\"/>\n        <path d=\"M8.33331 9.16667V13.3333\" stroke=\"#aaa\" stroke-width=\"1.5\" stroke-linecap=\"round\"/>\n        <path d=\"M11.6667 9.16667V13.3333\" stroke=\"#aaa\" stroke-width=\"1.5\" stroke-linecap=\"round\"/>\n        <path d=\"M7.5 6.5V4.5C7.5 3.94772 7.94772 3.5 8.5 3.5H11.5C12.0523 3.5 12.5 3.94772 12.5 4.5V6.5\" stroke=\"#aaa\" stroke-width=\"1.5\" stroke-linecap=\"round\"/>\n      </svg>\n    </button>\n  </div>`;
  const temp = document.createElement('div');
  temp.innerHTML = html;
  const el = temp.firstElementChild;
  trackedPairs.appendChild(el);
  // Para acceso global al eliminar
  window.removeTrackedPair = removeTrackedPair;
  // Click para ver detalles
  el.onclick = () => showPairDetails(symbol);
}

function removeTrackedPair(symbol) {
  tracked = tracked.filter(s => s !== symbol);
  localStorage.setItem('trackedPairs', JSON.stringify(tracked));
  renderTrackedPairs();
}

async function renderTrackedPairs() {
  const trackedPairs = document.getElementById('tracked-pairs');
  if (!trackedPairs) return;
  trackedPairs.innerHTML = '';
  for (const symbol of tracked) {
    const price = await fetchPrice(symbol);
    const stats = await fetch24hStats(symbol);
    const base = symbol.replace('USDT', '');
    let change = '';
    let changeClass = '';
    let changeIcon = '';
    if (stats && stats.priceChangePercent !== undefined) {
      const pct = parseFloat(stats.priceChangePercent);
      change = pct.toFixed(2) + '%';
      changeClass = pct > 0 ? 'positive' : (pct < 0 ? 'negative' : '');
      changeIcon = pct > 0 ? '<span class="arrow-up" style="vertical-align:middle;">▲</span>' : (pct < 0 ? '<span class="arrow-down" style="vertical-align:middle;">▼</span>' : '');
    }
    lastPrices[symbol] = price;
    const source = symbol === 'CTXCUSDT' ? 'HTX' : 'Binance';
    const sourceUrl = source === 'HTX' ? 'https://www.htx.com/' : 'https://www.binance.com/';
    let infoHtml = `<div class=\"coin-info\">
      <span class=\"coin-name\">${getCoinName(symbol)}</span>
      <span class=\"coin-symbol\">${base}/USDT <a class=\"pair-source-link\" href=\"${sourceUrl}\" target=\"_blank\">${source}</a></span>
    </div>`;
    const html = `<div class=\"tracked-pair\" data-symbol=\"${symbol}\">\n      ${infoHtml}\n      <span class=\"pair-price\" data-symbol=\"${symbol}\">${formatPrice(price)}</span>\n      <span class=\"pair-change ${changeClass}\" data-symbol=\"${symbol}\">${changeIcon}${change}</span>\n      <button class=\"delete-btn\" onclick=\"event.stopPropagation();window.removeTrackedPair && window.removeTrackedPair('${symbol}')\" title=\"Eliminar\">\n        <svg width=\"20\" height=\"20\" viewBox=\"0 0 20 20\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n          <path d=\"M5 6.5V15.5C5 16.3284 5.67157 17 6.5 17H13.5C14.3284 17 15 16.3284 15 15.5V6.5\" stroke=\"#aaa\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>\n          <path d=\"M3 6.5H17\" stroke=\"#aaa\" stroke-width=\"1.5\" stroke-linecap=\"round\"/>\n          <path d=\"M8.33331 9.16667V13.3333\" stroke=\"#aaa\" stroke-width=\"1.5\" stroke-linecap=\"round\"/>\n          <path d=\"M11.6667 9.16667V13.3333\" stroke=\"#aaa\" stroke-width=\"1.5\" stroke-linecap=\"round\"/>\n          <path d=\"M7.5 6.5V4.5C7.5 3.94772 7.94772 3.5 8.5 3.5H11.5C12.0523 3.5 12.5 3.94772 12.5 4.5V6.5\" stroke=\"#aaa\" stroke-width=\"1.5\" stroke-linecap=\"round\"/>\n        </svg>\n      </button>\n    </div>`;
    trackedPairs.innerHTML += html;
  }
  window.removeTrackedPair = removeTrackedPair;
  // Click para ver detalles
  document.querySelectorAll('.tracked-pair').forEach(el => {
    el.onclick = () => showPairDetails(el.dataset.symbol);
  });
}
function addTrackedPair(symbol) {
  if (!symbol) return;
  if (!tracked.includes(symbol)) {
    tracked.push(symbol);
    localStorage.setItem('trackedPairs', JSON.stringify(tracked));
    renderTrackedPairs();
  }
}
function removeTrackedPair(symbol) {
  tracked = tracked.filter(s => s !== symbol);
  localStorage.setItem('trackedPairs', JSON.stringify(tracked));
  renderTrackedPairs();
}

// --------- Candlestick rendering (con control de concurrencia y limpieza de handlers) ----------
async function renderCandlestick(symbol, interval) {
  // Evitar reentradas concurrentes
  if (candleRenderLock) {
    // si ya está renderizando, ignoramos la nueva petición (evita el error de canvas ocupado)
    return;
  }
  candleRenderLock = true;
  try {
    const candlestickChart = document.getElementById('candlestick-chart');
    if (!candlestickChart) {
      console.error('Canvas element not found!');
      return;
    }
    // Si existe un chart asociado a este canvas (cualquier ID), destruirlo primero
    try {
      const existing = Chart.getChart(candlestickChart); // Chart.getChart acepta canvas element
      if (existing) {
        try { existing.destroy(); } catch (e) { /* ignore */ }
        chartInstance = null;
      }
    } catch (e) {
      // Si no existe Chart.getChart (version antigua), también intentar destruir chartInstance
      if (chartInstance) {
        try { chartInstance.destroy(); } catch (err) { /* ignore */ }
        chartInstance = null;
      }
    }

    // Limpiar handlers previos para evitar duplicados
    candlestickChart.onwheel = null;
    candlestickChart.onmousedown = null;
    candlestickChart.onmousemove = null;
    // No sobrescribas global window.onmouseup a menos que lo controles aquí: limparlo
    try { window.onmouseup = null; } catch (e) { /* ignore */ }

    const ctx = candlestickChart.getContext('2d');
    if (!ctx) {
      console.error('Could not get canvas context!');
      return;
    }

    // Crear chart data para HTX o Binance
    if (symbol === 'CTXCUSDT') {
      const data = await fetchHTXCandles(symbol, interval);
      let start = Math.max(0, data.length - chartZoom);
      let end = data.length;
      const chartData = data.slice(start, end).map(d => ({ x: d.id * 1000, o: d.open, h: d.high, l: d.low, c: d.close }));
      chartInstance = new Chart(ctx, {
        type: 'candlestick',
        data: { datasets: [{ label: symbol, data: chartData, upColor: '#1ECB81', downColor: '#E74C4C', borderColor: '#181A20', borderWidth: 1.5, wickColor: { up: '#1ECB81', down: '#E74C4C', unchanged: '#F4F4F4' }, wickWidth: 2 }] },
        options: {
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: {
            x: { type: 'time', time: { unit: (interval === '1d' || interval === '3d') ? 'day' : ((interval === '4h' || interval === '1h') ? 'hour' : 'minute') }, grid: { color: '#353945' }, ticks: { color: '#F4F4F4' } },
            y: { grid: { color: '#353945' }, ticks: { color: '#F4F4F4' } }
          },
          responsive: true,
          maintainAspectRatio: false,
          aspectRatio: 2,
          animation: false
        },
        plugins: [crosshairPlugin]
      });

      // Zoom/pan handlers (asignados una sola vez)
      candlestickChart.onwheel = (e) => {
        e.preventDefault();
        if (e.deltaY < 0) chartZoom = Math.max(10, chartZoom - 10);
        else chartZoom = Math.min(chartZoom + 10, data.length);
        // Llamar a render pero respetando el lock (si ya está renderizando, se ignorará)
        renderCandlestick(symbol, interval);
      };
      let isPanning = false, panStartX = 0, panStartIndex = start;
      candlestickChart.onmousedown = (e) => { isPanning = true; panStartX = e.clientX; panStartIndex = start; };
      window.onmouseup = () => { isPanning = false; };
      candlestickChart.onmousemove = (e) => {
        if (isPanning) {
          const dx = e.clientX - panStartX;
          const moveBars = Math.round(dx / 3);
          let newStart = panStartIndex - moveBars;
          newStart = Math.max(0, Math.min(data.length - chartZoom, newStart));
          start = newStart; end = start + chartZoom;
          if (end > data.length) { end = data.length; start = Math.max(0, end - chartZoom); }
          const newChartData = data.slice(start, end).map(d => ({ x: d.id * 1000, o: d.open, h: d.high, l: d.low, c: d.close }));
          if (chartInstance && chartInstance.data && chartInstance.data.datasets && chartInstance.data.datasets[0]) {
            chartInstance.data.datasets[0].data = newChartData;
            chartInstance.update('none');
          }
        }
      };
      return;
    }

    // Binance klines
    const intervalMap = { '1d': '1d', '3d': '3d', '4h': '4h', '1h': '1h', '15m': '15m', '5m': '5m', '1m': '1m' };
    const qInterval = intervalMap[interval] || '1d';
    const res = await makeRequest(`${BINANCE_API}/klines?symbol=${symbol}&interval=${qInterval}&limit=500`);
    const data = res || [];
    let start = Math.max(0, data.length - chartZoom);
    let end = data.length;
    const chartData = data.slice(start, end).map(d => ({ x: d[0], o: parseFloat(d[1]), h: parseFloat(d[2]), l: parseFloat(d[3]), c: parseFloat(d[4]) }));
    chartInstance = new Chart(ctx, {
      type: 'candlestick',
      data: { datasets: [{ label: symbol, data: chartData, upColor: '#1ECB81', downColor: '#E74C4C', borderColor: '#181A20', borderWidth: 1.5, wickColor: { up: '#1ECB81', down: '#E74C4C', unchanged: '#F4F4F4' }, wickWidth: 2 }] },
      options: {
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { type: 'time', time: { unit: (interval === '1d' || interval === '3d') ? 'day' : ((interval === '4h' || interval === '1h') ? 'hour' : 'minute') }, grid: { color: '#353945' }, ticks: { color: '#F4F4F4' } },
          y: { grid: { color: '#353945' }, ticks: { color: '#F4F4F4' } }
        },
        responsive: true,
        maintainAspectRatio: false,
        aspectRatio: 2,
        animation: false
      },
      plugins: [crosshairPlugin]
    });

    // handlers
    candlestickChart.onwheel = (e) => {
      e.preventDefault();
      if (e.deltaY < 0) chartZoom = Math.max(10, chartZoom - 10);
      else chartZoom = Math.min(chartZoom + 10, data.length);
      renderCandlestick(symbol, interval);
    };
    let isPanning = false, panStartX = 0, panStartIndex = start;
    candlestickChart.onmousedown = (e) => { isPanning = true; panStartX = e.clientX; panStartIndex = start; };
    window.onmouseup = () => { isPanning = false; };
    candlestickChart.onmousemove = (e) => {
      if (isPanning) {
        const dx = e.clientX - panStartX;
        const moveBars = Math.round(dx / 3);
        let newStart = panStartIndex - moveBars;
        newStart = Math.max(0, Math.min(data.length - chartZoom, newStart));
        start = newStart; end = start + chartZoom;
        if (end > data.length) { end = data.length; start = Math.max(0, end - chartZoom); }
        const newChartData = data.slice(start, end).map(d => ({ x: d[0], o: parseFloat(d[1]), h: parseFloat(d[2]), l: parseFloat(d[3]), c: parseFloat(d[4]) }));
        if (chartInstance && chartInstance.data && chartInstance.data.datasets && chartInstance.data.datasets[0]) {
          chartInstance.data.datasets[0].data = newChartData;
          chartInstance.update('none');
        }
      }
    };

  } finally {
    candleRenderLock = false;
  }
}

// --------- Mostrar detalles par ----------
async function showPairDetails(symbol) {
  const pairDetails = document.getElementById('pair-details');
  const pairTitle = document.getElementById('pair-title');
  const candlestickChart = document.getElementById('candlestick-chart');
  if (!pairDetails || !pairTitle || !candlestickChart) return;

  currentPair = symbol;
  pairDetails.classList.remove('hidden');
  const price = await fetchPrice(symbol);
  const stats = await fetch24hStats(symbol);
  const base = symbol.replace('USDT', '');
  const change = parseFloat(stats.priceChange || 0);
  const changePct = parseFloat(stats.priceChangePercent || 0);
  const changeClass = change > 0 ? 'positive' : (change < 0 ? 'negative' : '');
  pairTitle.innerHTML = `${base}/USDT <span class="pair-price-inline">$${formatPrice(price)}</span> <span class="pair-change-inline ${changeClass}">${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%</span>`;

  const oldStats = document.querySelector('.pair-stats');
  if (oldStats) oldStats.remove();
  const high = parseFloat(stats.highPrice || 0);
  const low = parseFloat(stats.lowPrice || 0);
  const volBase = parseFloat(stats.volume || 0);
  const volUSDT = parseFloat(stats.quoteVolume || 0);
  let statsHtml = `
    <div class="pair-stats" style="display:flex;flex-wrap:wrap;gap:24px 32px;margin:10px 0 18px 0;">
      <div><span class="label">24h Change</span> <span class="pair-change ${changeClass}">${change >= 0 ? '+' : ''}${change.toFixed(4)} ${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%</span></div>
      <div><span class="label">24h High</span> <span>${high}</span></div>
      <div><span class="label">24h Low</span> <span>${low}</span></div>
      <div><span class="label">24h Volume (${base})</span> <span>${volBase?.toLocaleString?.() ?? '-'}</span></div>
      <div><span class="label">24h Volume (USDT)</span> <span>${volUSDT?.toLocaleString?.() ?? '-'}</span></div>
    </div>
  `;
  pairTitle.insertAdjacentHTML('afterend', statsHtml);
  renderCandlestick(symbol, currentInterval);
}

// --------- Sugerencias lista de coins (Binance) ----------
let coinsList = [];
async function fetchCoinsList() {
  try {
    const res = await makeRequest(`${BINANCE_API}/exchangeInfo`);
    const data = res;
    coinsList = (data.symbols || []).filter(s => s.quoteAsset === 'USDT').map(s => ({ symbol: s.symbol, base: s.baseAsset, quote: s.quoteAsset }));
  } catch (error) {
    console.error('Error fetching coins list:', error);
    coinsList = [];
  }
}

// --------- Wallet/Transactions section ----------
function getSavedWallets() { return JSON.parse(localStorage.getItem('savedWallets') || '[]'); }
function saveWallet(address) {
  let wallets = getSavedWallets();
  if (!wallets.includes(address)) { wallets.push(address); localStorage.setItem('savedWallets', JSON.stringify(wallets)); }
}
function renderSavedWallets(selectedAddress = null) {
  const select = document.getElementById('savedWallets');
  if (!select) return;
  let wallets = getSavedWallets();
  wallets = wallets.filter(w => typeof w === 'string' && /^0x[a-fA-F0-9]{40}$/.test(w));
  localStorage.setItem('savedWallets', JSON.stringify(wallets));
  select.innerHTML = wallets.length ? wallets.map(w => `<option value="${w}">${w}</option>`).join('') : '<option value="">(Sin billeteras guardadas)</option>';
  if (wallets.length) select.value = selectedAddress || wallets[wallets.length - 1];
}

// Tx state
let txList = [], offset = 0;
let currentTxAddress = null;

async function loadTx() {
  const tbody = document.getElementById('txBody');
  if (!tbody) return;
  const slice = txList.slice(offset, offset + 10);
  const grouped = {};
  for (const tx of slice) {
    if (!tx || !tx.timeStamp) continue;
    const date = new Date(tx.timeStamp * 1000).toLocaleDateString('es-ES');
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(tx);
  }
  const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  for (const date of Object.keys(grouped)) {
    const [day, month, year] = date.split('/');
    const dateObj = new Date(`${year}-${month}-${day}`);
    const dateStr = `${parseInt(day)} ${monthNames[dateObj.getMonth()]}${year ? ', ' + year : ''}`;
    const dateDiv = document.createElement('tr');
    dateDiv.className = 'tx-date-row';
    dateDiv.innerHTML = `<td colspan='8'>${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)}</td>`;
    tbody.appendChild(dateDiv);
    const tagsRow = document.createElement('tr');
    tagsRow.className = 'tx-list-tags';
    tagsRow.innerHTML = `<td>tipo</td><td>token</td><td>cantidad</td><td>USD / P&L</td>`;
    tbody.appendChild(tagsRow);
    for (const tx of grouped[date]) {
      const addr = currentTxAddress ? currentTxAddress.toLowerCase() : '';
      const isSent = tx.from && tx.from.toLowerCase() === addr;
      const type = isSent ? 'Sent' : 'Received';
      const sym = tx.tokenSymbol || 'ETH';
      const dec = tx.tokenDecimal || 18;
      const amt = parseInt(tx.value) / 10 ** dec;
      let icon = '';
      if (sym === 'USUAL') icon = '<img src="https://app.usual.money/tokens/USUAL.webp" alt="USUAL" style="width:16px;height:16px;vertical-align:middle;margin-right:3px;">';
      else if (sym === 'USUALX') icon = '<img src="https://static.coinstats.app/coins/usualxXxe.png" alt="USUALX" style="width:16px;height:16px;vertical-align:middle;margin-right:3px;">';
      else if (sym === 'USD0') icon = '<img src="https://static.coinstats.app/coins/usual-usdE9O.png" alt="USD0" style="width:16px;height:16px;vertical-align:middle;margin-right:3px;">';
      else if (sym === 'BIO') icon = '<img src="https://etherscan.io/token/images/bioxyz_32.png" alt="BIO" style="width:18px;height:18px;vertical-align:middle;margin-right:4px;">';
      else if (sym === 'ETH') icon = '<img src="https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Ethereum-icon-purple.svg/1200px-Ethereum-icon-purple.svg.png" alt="ETH" style="width:18px;height:18px;vertical-align:middle;margin-right:4px;">';
      else if (sym === 'USDT') icon = '<img src="https://cryptologos.cc/logos/tether-usdt-logo.png" alt="USDT" style="width:18px;height:18px;vertical-align:middle;margin-right:4px;">';

      // Format amounts: ETH -> 6 decimals, others -> 4
      const amtFormatted = sym === 'ETH' ? Number(amt).toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 }) : Number(amt).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });

      let amountText = isSent ? `<span class='tx-amount sent'>- ${amtFormatted}</span>` : `<span class='tx-amount'>+ ${amtFormatted}</span>`;
      let priceUSD = 0;
      if (sym === 'ETH') priceUSD = await getTokenPriceUSD('ETH');
      else priceUSD = await getTokenPriceUSD(sym);
      let usd = amt * (priceUSD || 0);
      const txDateObj = new Date(tx.timeStamp * 1000);
      let priceHist = await getHistoricalTokenPriceUSD(sym, txDateObj);
      let noData = false;
      if (!priceHist || priceHist === 0) { noData = true; priceHist = null; }
      let usdHist = amt * (priceHist || 0);
      let pl = usd - usdHist;
      let plPct = usdHist ? (pl / usdHist) * 100 : 0;
      let plColor = pl > 0 ? '#1ecb81' : (pl < 0 ? '#e74c3c' : '#aaa');
      let amountDetail = noData ? `<div class='tx-detail' style='color:#e74c3c;'>Sin datos históricos</div>` : `<div class='tx-detail'>$${usdHist.toLocaleString(undefined, { maximumFractionDigits: 2 })} (1 ${sym} = $${priceHist ? priceHist.toFixed(4) : '-'})</div>`;
      const row = document.createElement('tr');
      row.className = 'tx-list-row';
      row.innerHTML = `
        <td class='tx-type${isSent ? ' sent' : ''}'>${type}</td>
        <td class='tx-token'>${icon}${sym}</td>
        <td>${amountText}${amountDetail}</td>
        <td class='tx-usd'>
          <div>$${usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
          <div style="font-size:0.95em; color:${plColor}; font-weight:600; line-height:1.2;">${pl >= 0 ? '+' : ''}${pl.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
          <div style="font-size:0.85em; color:${plColor}; line-height:1.1;">(${plPct >= 0 ? '+' : ''}${plPct.toFixed(2)}%)</div>
        </td>
      `;
      tbody.appendChild(row);
    }
  }
  offset += 10;
  const txTableEl = document.getElementById('txTable');
  if (txTableEl) txTableEl.style.display = 'table';
  const btnMore = document.getElementById('btnLoadMore');
  if (btnMore) {
    if (offset < txList.length) btnMore.parentElement.style.display = 'block';
    else btnMore.parentElement.style.display = 'none';
  }
}

async function fetchAndShowTransactions(address) {
  offset = 0; txList = []; currentTxAddress = address;
  const tbody = document.getElementById('txBody');
  if (tbody) tbody.innerHTML = '';
  if (!address) return;
  try {
    const res = await makeRequest(`${ETH_API}?module=account&action=tokentx&address=${address}&sort=desc&apikey=${ETH_KEY}`);
    const data = res;
    txList = data.result || [];
    loadTx();
  } catch (error) {
    console.error('Error fetching transactions:', error);
  }
}

// --------- Wallet balances render usando Etherscan + CoinStats ----------
// Muestra sólo assets con total USD > 0 y los agrupa por cadena (chain)
async function fetchAndRenderWallet(address) {
  const walletDataEl = document.getElementById('walletData');
  if (!walletDataEl) return;
  walletDataEl.innerHTML = '<div class="wallet-loading">Cargando balances...</div>';
  try {
    const res = await makeRequest(`${ETH_API}?module=account&action=balance&address=${address}&tag=latest&apikey=${ETH_KEY}`);
    if (!res || res.status !== '1') {
      walletDataEl.innerHTML = `<div class="wallet-error">No se pudo obtener balance ETH: ${res?.message || 'error'}</div>`;
      return;
    }
    let ethBal = parseInt(res.result) / 1e18;
    if (isNaN(ethBal)) ethBal = 0;

    const txRes = await makeRequest(`${ETH_API}?module=account&action=tokentx&address=${address}&sort=desc&apikey=${ETH_KEY}`);
    const tokens = {};
    if (txRes.result && Array.isArray(txRes.result)) {
      txRes.result.forEach(t => {
        if (!t || !t.contractAddress) return;
        tokens[t.contractAddress.toLowerCase()] = { symbol: t.tokenSymbol, decimals: t.tokenDecimal, contract: t.contractAddress.toLowerCase() };
      });
    }
    const addrs = Object.keys(tokens).slice(0, 20);

    // ETH price and total
    const ethPrice = await getTokenPriceUSD('ETH');
    const ethTotal = ethPrice ? ethBal * ethPrice : 0;
    const assets = [{ name: 'ETH', symbol: 'ETH', amount: ethBal, price: ethPrice, total: ethTotal, chain: 'Ethereum' }];

    for (const c of addrs) {
      const token = tokens[c];
      try {
        const bRes = await makeRequest(`${ETH_API}?module=account&action=tokenbalance&contractaddress=${c}&address=${address}&tag=latest&apikey=${ETH_KEY}`);
        let val = parseInt(bRes.result) / (10 ** (token.decimals || 18));
        if (isNaN(val)) val = 0;

        // Try CoinStats price first
        let price = await getTokenPriceUSD(token.symbol);
        let chainName = null;

        // If no price from CoinStats, try Dexscreener for price + chain detection
        if ((price === null || price === undefined) && c) {
          try {
            const pairRes = await makeRequest(`https://api.dexscreener.com/latest/dex/tokens/${c}`);
            if (pairRes && pairRes.pairs && pairRes.pairs.length) {
              // prefer a pair quoted in USDT
              const p = pairRes.pairs.find(pp => pp.quoteToken?.symbol === 'USDT') || pairRes.pairs[0];
              if (p) {
                if (p.priceUsd) price = parseFloat(p.priceUsd);
                // Detect chain name from dexscreener response (may vary)
                chainName = (p.chain || p.chainId || p.network || p.pair?.chain || p.dexName || p.source) || null;
                // normalize common values
                if (typeof chainName === 'string') {
                  chainName = chainName.toLowerCase();
                  if (chainName.includes('ethereum')) chainName = 'Ethereum';
                  else if (chainName.includes('polygon')) chainName = 'Polygon';
                  else if (chainName.includes('bsc') || chainName.includes('binance')) chainName = 'BSC';
                  else chainName = chainName.charAt(0).toUpperCase() + chainName.slice(1);
                }
              }
            }
          } catch (e) { /* ignore dexscreener fallback errors */ }
        }

        // default chain for ERC20 coming from Etherscan = Ethereum
        if (!chainName) chainName = 'Ethereum';

        const total = price ? (val * price) : 0;
        assets.push({ name: token.symbol, symbol: token.symbol, amount: val, price: price, total: total, chain: chainName });
      } catch (e) {
        console.warn('token balance error', c, e);
      }
    }

    // FILTRAR: solo assets con valor en USD mayor a 0
    const nonZeroAssets = assets.filter(a => a.total && a.total > 0);

    // Agrupar por cadena
    const byChain = {};
    for (const a of nonZeroAssets) {
      const chain = a.chain || 'Ethereum';
      if (!byChain[chain]) byChain[chain] = [];
      byChain[chain].push(a);
    }

    // Calcular total del portafolio (solo con assets > 0)
    const assetsTotal = nonZeroAssets.reduce((acc, a) => acc + (a.total || 0), 0);

    // Render HTML agrupado por cadena
    let html = `<div class="wallet-dashboard" style="padding:18px 8px 10px 8px;">
      <div class="wallet-totals" style="margin-bottom:10px;">
        <div class="wallet-total-title">Total Worth</div>
        <div class="wallet-total-usd">$${assetsTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
        <div class="wallet-total-sub" style="margin-bottom:6px;">Assets: $${assetsTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} &nbsp; | &nbsp; DeFi: $0</div>
      </div>`;

    // Para cada chain, renderizar su bloque (orden alfabético por nombre)
    const chains = Object.keys(byChain).sort();
    for (const chain of chains) {
      const list = byChain[chain];
      const chainTotal = list.reduce((s, x) => s + (x.total || 0), 0);
      html += `<div class="wallet-assets-card" style="margin-bottom:10px;padding:10px 6px 8px 6px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <div class="wallet-section-title" style="margin-bottom:4px;margin-top:0;">${chain}</div>
          <div style="font-weight:700;">Total ${chain}: $${chainTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
        </div>
        <table class="wallet-assets-table">
          <thead><tr><th>Name</th><th>Amount</th><th>Price</th><th>Total</th></thead>
          <tbody>`;

      // Filas de tokens en la cadena
      html += list.map(a => {
        let icon = '';
        if (a.symbol === 'USUAL') icon = '<img src="https://app.usual.money/tokens/USUAL.webp" alt="USUAL" style="width:18px;height:18px;vertical-align:middle;margin-right:4px;">';
        else if (a.symbol === 'USUALX') icon = '<img src="https://static.coinstats.app/coins/usualxXxe.png" alt="USUALX" style="width:18px;height:18px;vertical-align:middle;margin-right:4px;">';
        else if (a.symbol === 'USD0') icon = '<img src="https://static.coinstats.app/coins/usual-usdE9O.png" alt="USD0" style="width:18px;height:18px;vertical-align:middle;margin-right:4px;">';
        else if (a.symbol === 'BIO') icon = '<img src="https://etherscan.io/token/images/bioxyz_32.png" alt="BIO" style="width:18px;height:18px;vertical-align:middle;margin-right:4px;">';
        else if (a.symbol === 'ETH') icon = '<img src="https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Ethereum-icon-purple.svg/1200px-Ethereum-icon-purple.svg.png" alt="ETH" style="width:18px;height:18px;vertical-align:middle;margin-right:4px;">';
        else if (a.symbol === 'USDT') icon = '<img src="https://cryptologos.cc/logos/tether-usdt-logo.png" alt="USDT" style="width:18px;height:18px;vertical-align:middle;margin-right:4px;">';

        // Price format: 4 decimals for special tokens
        const special4 = ['USUAL', 'USUALX', 'USD0', 'BIO'];
        const priceStr = (a.price === null || a.price === undefined) ? '-' : (special4.includes((a.symbol || '').toUpperCase()) ? ('$' + Number(a.price).toFixed(4)) : ('$' + Number(a.price).toFixed(2)));

        // Amount format: ETH -> 6, others -> 4
        const amountStr = (a.amount === null || a.amount === undefined) ? '-' : ((a.symbol === 'ETH') ? Number(a.amount).toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 }) : Number(a.amount).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 }));

        // Total USD (2 decimals)
        const totalStr = a.total ? ('$' + a.total.toLocaleString(undefined, { maximumFractionDigits: 2 })) : '-';

        return `<tr><td>${icon}${a.symbol}</td><td>${amountStr}</td><td>${priceStr}</td><td>${totalStr}</td></tr>`;
      }).join('');

      html += `</tbody></table></div>`;
    }

    html += `</div>`; // cierre wallet-dashboard

    walletDataEl.innerHTML = html;

    if (window.fetchAndShowTransactions) window.fetchAndShowTransactions(address);
  } catch (err) {
    console.error('fetchAndRenderWallet error', err);
    const walletDataEl = document.getElementById('walletData');
    if (walletDataEl) walletDataEl.innerHTML = `<div class="wallet-error">Error: ${err.message}</div>`;
  }
}

// --------- Inicialización DOMContentLoaded ----------
document.addEventListener('DOMContentLoaded', function () {
  // Restaurar tracked pairs
  if (localStorage.getItem('trackedPairs')) {
    try { tracked = JSON.parse(localStorage.getItem('trackedPairs')) || []; } catch { tracked = []; }
  }

  // Chart.js defaults
  if (window.Chart && window.Chart.defaults && window.Chart.defaults.elements && window.Chart.defaults.elements.candlestick) {
    window.Chart.defaults.elements.candlestick.color = { up: '#1ECB81', down: '#E74C4C', unchanged: '#F4F4F4' };
    window.Chart.defaults.elements.candlestick.borderColor = { up: '#1ECB81', down: '#E74C4C', unchanged: '#F4F4F4' };
  }

  // DOM elements
  const pairSearch = document.getElementById('pair-search');
  const pairSuggestions = document.getElementById('pair-suggestions');
  const pairDetails = document.getElementById('pair-details');
  const closeDetails = document.getElementById('close-details');
  const intervalSelector = document.querySelector('.interval-selector');

  // Close details
  if (closeDetails) {
    closeDetails.addEventListener('click', () => {
      if (pairDetails) pairDetails.classList.add('hidden');
      // destruir chart si existe
      try {
        const existing = Chart.getChart(document.getElementById('candlestick-chart'));
        if (existing) existing.destroy();
      } catch (e) {
        if (chartInstance) { try { chartInstance.destroy(); } catch (err) { } chartInstance = null; }
      }
    });
  }

  // Wallet fetch button binding
  const btnFetchWallet = document.getElementById('btnFetchWallet');
  if (btnFetchWallet) {
    btnFetchWallet.addEventListener('click', async () => {
      const address = document.getElementById('walletAddress').value.trim();
      const walletDataEl = document.getElementById('walletData');
      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) return alert('Por favor ingresa una dirección válida.');
      if (walletDataEl) walletDataEl.innerHTML = '<div class="wallet-loading">Cargando balances...</div>';
      try {
        await fetchAndRenderWallet(address);
      } catch (err) {
        if (walletDataEl) walletDataEl.innerHTML = `<div class="wallet-error">Error: ${err.message}</div>`;
      }
    });
  }

  // Ensure interval selector contains requested intervals (1d, 3d, 4h, 1h, 15m, 5m, 1m)
  if (intervalSelector) {
    const desired = [
      { key: '3d', label: '3D' },
      { key: '1d', label: '1D' },
      { key: '4h', label: '4H' },
      { key: '1h', label: '1H' },
      { key: '15m', label: '15M' },
      { key: '5m', label: '5M' },
      { key: '1m', label: '1M' }
    ];
    intervalSelector.innerHTML = '';
    desired.forEach(d => {
      const btn = document.createElement('button');
      btn.dataset.interval = d.key;
      btn.textContent = d.label;
      if (d.key === '1d') btn.classList.add('active');
      intervalSelector.appendChild(btn);
    });
    intervalSelector.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') {
        currentInterval = e.target.dataset.interval;
        window.currentInterval = currentInterval;
        intervalSelector.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        if (currentPair) renderCandlestick(currentPair, currentInterval);
      }
    });
  }

  // Fetch coins list for suggestions
  fetchCoinsList();

  // Pair suggestions
  if (pairSearch && pairSuggestions) {
    pairSearch.addEventListener('input', () => {
      const q = pairSearch.value.trim().toUpperCase();
      if (!q) { pairSuggestions.classList.remove('active'); return; }
      const matches = coinsList.filter(c => c.base.startsWith(q) || c.symbol.startsWith(q)).slice(0, 8);
      if (matches.length === 0) {
        pairSuggestions.innerHTML = '<div>No se encontraron monedas.</div>';
        pairSuggestions.classList.add('active');
        return;
      }
      pairSuggestions.innerHTML = matches.map(c => `<div data-symbol="${c.symbol}">${c.base}/USDT</div>`).join('');
      pairSuggestions.classList.add('active');
    });
    pairSuggestions.addEventListener('click', (e) => {
      if (e.target.dataset.symbol) {
        addTrackedPair(e.target.dataset.symbol);
        pairSuggestions.classList.remove('active');
        pairSearch.value = '';
      }
    });
    document.addEventListener('click', (e) => {
      if (pairSuggestions && !pairSuggestions.contains(e.target) && e.target !== pairSearch) pairSuggestions.classList.remove('active');
    });
  }

  // Render tracked pairs
  renderTrackedPairs();

  // Auto-update prices every 5s
  setInterval(async () => {
    const priceSpans = document.querySelectorAll('.pair-price');
    for (const span of priceSpans) {
      const symbol = span.getAttribute('data-symbol');
      const price = await fetchPrice(symbol);
      const stats = await fetch24hStats(symbol);
      span.textContent = formatPrice(price);
      const el = createPairHtml(symbol, price, stats);
      const oldEl = document.querySelector(`.tracked-pair[data-symbol="${symbol}"]`);
      if (oldEl) oldEl.replaceWith(el);
    }
  }, 5000);

  // Saved wallets UI
  renderSavedWallets();
  const walletsOnLoad = getSavedWallets();
  if (walletsOnLoad.length) {
    const walletAddress = document.getElementById('walletAddress');
    if (walletAddress) {
      walletAddress.value = walletsOnLoad[walletsOnLoad.length - 1];
      const btnFetchWallet = document.getElementById('btnFetchWallet');
      if (btnFetchWallet) btnFetchWallet.click();
    }
  }

  const btnSaveWallet = document.getElementById('btnSaveWallet');
  if (btnSaveWallet) {
    btnSaveWallet.addEventListener('click', () => {
      const address = document.getElementById('walletAddress').value.trim();
      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) { alert('Dirección no válida'); return; }
      saveWallet(address);
      renderSavedWallets(address);
      document.getElementById('walletAddress').value = address;
      const btnFetchWallet = document.getElementById('btnFetchWallet');
      if (btnFetchWallet) btnFetchWallet.click();
    });
  }

  const savedWallets = document.getElementById('savedWallets');
  if (savedWallets) {
    savedWallets.addEventListener('change', (e) => {
      const address = e.target.value;
      if (address) {
        document.getElementById('walletAddress').value = address;
        const btnFetchWallet = document.getElementById('btnFetchWallet');
        if (btnFetchWallet) btnFetchWallet.click();
      }
    });
  }

  const btnDeleteWallet = document.getElementById('btnDeleteWallet');
  if (btnDeleteWallet) {
    btnDeleteWallet.addEventListener('click', () => {
      const select = document.getElementById('savedWallets');
      const address = select.value;
      if (!address) return;
      let wallets = getSavedWallets();
      wallets = wallets.filter(w => w !== address);
      localStorage.setItem('savedWallets', JSON.stringify(wallets));
      renderSavedWallets();
      document.getElementById('walletAddress').value = '';
      const walletData = document.getElementById('walletData');
      if (walletData) walletData.innerHTML = '';
    });
  }

  const btnCopyWallet = document.getElementById('btnCopyWallet');
  if (btnCopyWallet) {
    btnCopyWallet.addEventListener('click', async () => {
      const select = document.getElementById('savedWallets');
      const address = select.value;
      if (!address) return;
      try {
        await navigator.clipboard.writeText(address);
        const btn = document.getElementById('btnCopyWallet');
        const originalIcon = btn.innerHTML;
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d='M5 10.5L9 14.5L15 7.5' stroke='#45b26b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/></svg>`;
        setTimeout(() => { btn.innerHTML = originalIcon; }, 1200);
      } catch {
        alert('No se pudo copiar');
      }
    });
  }

  const btnLoadMore = document.getElementById('btnLoadMore');
  if (btnLoadMore) btnLoadMore.addEventListener('click', loadTx);

  // Exponer globalmente para compatibilidad
  window.fetchAndShowTransactions = fetchAndShowTransactions;
  window.removeTrackedPair = removeTrackedPair;
});

// Puente si la página esperaba fetchAndShowTransactions globalmente
if (!window.fetchAndShowTransactions) {
  window.fetchAndShowTransactions = async function (address) {
    if (!address) return;
    try { await fetchAndShowTransactions(address); } catch (e) { /* ignore */ }
  };
}
