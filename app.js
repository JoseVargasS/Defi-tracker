// Configuración
const ETHERSCAN_API_KEY = 'F7F8ZYHRFCQU3CC3H8R15A5E3NN5GH1CU4';
const ETHERSCAN_API = 'https://api.etherscan.io/api';
const BINANCE_API = 'https://api.binance.com/api/v3';
const COVALENT_API_KEY = 'ckey_docs'; // Puedes reemplazar por tu propia API key gratuita
const COVALENT_API = 'https://api.covalenthq.com/v1';
const COINGECKO_API = 'https://api.coingecko.com/api/v3';

// Elementos DOM
const walletForm = document.getElementById('wallet-form');
const walletInput = document.getElementById('wallet-address');
const walletInfo = document.getElementById('wallet-info');
const pairForm = document.getElementById('pair-form');
const pairSearch = document.getElementById('pair-search');
const pairSuggestions = document.getElementById('pair-suggestions');
const trackedPairs = document.getElementById('tracked-pairs');
const pairDetails = document.getElementById('pair-details');
const closeDetails = document.getElementById('close-details');
const pairTitle = document.getElementById('pair-title');
const pairPrice = document.getElementById('pair-price');
const intervalSelector = document.querySelector('.interval-selector');
const candlestickChart = document.getElementById('candlestick-chart');

let tracked = [];
// Restaurar pares seguidos desde localStorage
if (localStorage.getItem('trackedPairs')) {
  try {
    tracked = JSON.parse(localStorage.getItem('trackedPairs')) || [];
  } catch { tracked = []; }
}
let chartInstance = null;
let currentPair = null;
let currentInterval = '1d';
let chartZoom = 60; // Número de velas visibles (zoom)
let lastPrices = {};
let coinIcons = {};

// Plugin crosshair para Chart.js
const crosshairPlugin = {
  id: 'crosshair',
  afterInit(chart) {
    chart.crosshair = { x: null, y: null, snapIndex: null };
    chart.canvas.addEventListener('mousemove', function (e) {
      const rect = chart.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      // Snap a la vela más cercana
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
    });
    chart.canvas.addEventListener('mouseleave', function () {
      chart.crosshair.x = null;
      chart.crosshair.y = null;
      chart.crosshair.snapIndex = null;
      chart.draw();
    });
  },
  afterDraw(chart) {
    if (chart.crosshair && chart.crosshair.x !== null && chart.crosshair.y !== null) {
      const ctx = chart.ctx;
      ctx.save();
      ctx.strokeStyle = '#45B26B';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      // Línea vertical
      ctx.beginPath();
      ctx.moveTo(chart.crosshair.x, chart.chartArea.top);
      ctx.lineTo(chart.crosshair.x, chart.chartArea.bottom);
      ctx.stroke();
      // Línea horizontal
      ctx.beginPath();
      ctx.moveTo(chart.chartArea.left, chart.crosshair.y);
      ctx.lineTo(chart.chartArea.right, chart.crosshair.y);
      ctx.stroke();
      ctx.setLineDash([]);
      // Etiqueta flotante eje Y (precio)
      let yValue = chart.scales.y.getValueForPixel(chart.crosshair.y);
      let yLabel = yValue ? yValue.toFixed(4) : '';
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
        ctx.roundRect(boxX, boxY, labelWidth, labelHeight, 7);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#F4F4F4';
        ctx.fillText(yLabel, boxX + labelWidth / 2, boxY + labelHeight / 2);
      }
      // Etiqueta flotante eje X (fecha/hora) con snap
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
        if (interval === '1d') {
          dateLabel = date.toLocaleDateString();
        } else if (interval === '4h' || interval === '1h' || interval === '15m') {
          // Mostrar fecha y hora en formato dd/mm/yyyy HH:MM (24h)
          const day = String(date.getDate()).padStart(2, '0');
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const year = date.getFullYear();
          const hour = String(date.getHours()).padStart(2, '0');
          const min = String(date.getMinutes()).padStart(2, '0');
          dateLabel = `${day}/${month}/${year} ${hour}:${min}`;
        } else {
          dateLabel = date.toLocaleString();
        }
        // (Opcional para depuración)
        // dateLabel += ` (${interval})`;
        ctx.font = '12px Inter, Arial';
        ctx.textBaseline = 'top';
        ctx.textAlign = 'center';
        const labelWidth = ctx.measureText(dateLabel).width + 16;
        const labelHeight = 22;
        let xBoxX = chart.crosshair.x - labelWidth / 2;
        if (xBoxX + labelWidth > chart.width) {
          xBoxX = chart.width - labelWidth - 6;
        }
        if (xBoxX < 0) {
          xBoxX = 6;
        }
        let xBoxY = chart.chartArea.bottom + 6;
        if (xBoxY + labelHeight > chart.height) {
          xBoxY = chart.chartArea.bottom - labelHeight - 6;
        }
        ctx.fillStyle = '#23262F';
        ctx.strokeStyle = '#45B26B';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(xBoxX, xBoxY, labelWidth, labelHeight, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#F4F4F4';
        ctx.fillText(dateLabel, xBoxX + labelWidth / 2, xBoxY + 11);
      }
      ctx.restore();
    }
  }
};

// Utilidades
function formatPrice(price) {
  price = parseFloat(price);
  return price < 1 ? price.toFixed(4) : price.toFixed(2);
}

function showMessage(el, msg, type = 'info') {
  el.innerHTML = `<div class="msg ${type}">${msg}</div>`;
}

// Contratos de tokens personalizados para mostrar en billetera
const customTokens = [
  {
    address: '0x6d6f697e34145bb95c54e77482d97cc261dc237e', // USUAL
    symbol: 'USUAL',
    decimals: 18
  },
  {
    address: '0x430EF9263E76DAE63C84292C3409D61c598E9682', // USUALx
    symbol: 'USUALX',
    decimals: 18
  },
  {
    address: '0x6fC2107235CA4ed3c5bF5bE1b8b2A6eA6A1eA0C2', // USD0
    symbol: 'USD0',
    decimals: 18
  }
];

// --- NUEVO CÓDIGO PARA CONSULTA DE BILLETERA ETH ---
const ETH_API = 'https://api.etherscan.io/v2/api';
const ETH_KEY = 'F7F8ZYHRFCQU3CC3H8R15A5E3NN5GH1CU4';
const walletDataEl = document.getElementById('walletData');

async function getEthPriceUSD() {
  // 1. CoinGecko
  try {
    const res = await fetch(`${COINGECKO_API}/simple/price?ids=ethereum&vs_currencies=usd`);
    const data = await res.json();
    if (data.ethereum && data.ethereum.usd && data.ethereum.usd > 0) return data.ethereum.usd;
  } catch { }
  // 2. CoinStats fallback
  try {
    const res = await fetch('https://api.coinstats.app/public/v1/coins/ethereum');
    const data = await res.json();
    if (data.coin && data.coin.price && data.coin.price > 0) return data.coin.price;
  } catch { }
  return null;
}

async function getTokenPriceUSD(symbol) {
  // 1. CoinGecko
  const map = { USUAL: 'usual', USUALX: 'usualx', USD0: 'usd0', ETH: 'ethereum' };
  const id = map[symbol.toUpperCase()] || symbol.toLowerCase();
  try {
    const res = await fetch(`${COINGECKO_API}/simple/price?ids=${id}&vs_currencies=usd`);
    const data = await res.json();
    let price = data[id]?.usd || null;
    if (price && price > 0) {
      if (["usual", "usualx"].includes(id)) return parseFloat(price.toFixed(4));
      return price;
    }
  } catch { }
  // 2. CoinStats fallback
  try {
    const res = await fetch(`https://api.coinstats.app/public/v1/coins/${id}`);
    const data = await res.json();
    let price = data.coin && data.coin.price ? data.coin.price : null;
    if (price && price > 0) {
      if (["usual", "usualx"].includes(id)) return parseFloat(price.toFixed(4));
      return price;
    }
  } catch { }
  // 3. Si es USD0 y no hay precio, asumir 1
  if (symbol.toUpperCase() === 'USD0') return 1;
  return null;
}

async function getHistoricalTokenPriceUSD(symbol, date, forceFallback = false) {
  // symbol: 'USUAL', 'USUALX', 'USD0', 'ETH', etc.
  // date: Date object
  const map = { USUAL: 'usual', USUALX: 'usualx', USD0: 'usd0', ETH: 'ethereum' };
  const id = map[symbol.toUpperCase()];

  // CoinStats para USUALX y USD0
  if (symbol.toUpperCase() === 'USUALX' || symbol.toUpperCase() === 'USD0') {
    try {
      const coinId = symbol.toUpperCase() === 'USUALX' ? 'usualx' : 'usd0';
      const res = await fetch(`https://api.coinstats.app/public/v1/charts?period=all&coinId=${coinId}`);
      const data = await res.json();
      if (data && data.chart && data.chart.length) {
        let minDiff = Infinity;
        let closest = null;
        let closestTs = null;
        const txTs = date.getTime(); // milisegundos
        for (const [priceTs, price] of data.chart) {
          // CoinStats devuelve timestamps en segundos, convertir a milisegundos
          const priceTsMs = priceTs * 1000;
          const diff = Math.abs(priceTsMs - txTs);
          if (diff < minDiff) {
            minDiff = diff;
            closest = price;
            closestTs = priceTsMs;
          }
        }
        // Si la diferencia es mayor a 12 horas, mostrar aviso
        let lowPrec = "";
        if (minDiff > 12 * 60 * 60 * 1000) {
          lowPrec = "<span title='El precio histórico puede no ser preciso' style='color:#e7c000;font-size:1em;margin-left:4px;'>⚠️</span>";
        }
        if (closest) return parseFloat(closest);
      }
    } catch { }
  }

  // Dexscreener: buscar address
  const custom = customTokens.find(t => t.symbol === symbol.toUpperCase());
  if (custom) {
    try {
      // Buscar el par USDT en Ethereum
      const tokenAddress = custom.address;
      const pairRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
      const pairData = await pairRes.json();
      // Buscar el par con USDT en Ethereum
      const pair = (pairData.pairs || []).find(p => p.baseToken.address.toLowerCase() === tokenAddress.toLowerCase() && p.quoteToken.symbol === 'USDT' && p.chainId === 'ethereum');
      if (pair && pair.pairAddress) {
        // Buscar vela más cercana al timestamp
        const ts = Math.floor(date.getTime() / 1000);
        const from = ts - 60 * 60 * 3; // 3 horas antes
        const to = ts + 60 * 60 * 3;   // 3 horas después
        const candlesRes = await fetch(`https://api.dexscreener.com/latest/dex/pairs/ethereum/${pair.pairAddress}/candles?interval=1h&from=${from}&to=${to}`);
        const candlesData = await candlesRes.json();
        if (candlesData && candlesData.candles && candlesData.candles.length) {
          // Buscar la vela más cercana
          let minDiff = Infinity;
          let closest = null;
          for (const candle of candlesData.candles) {
            const diff = Math.abs(candle.timestamp * 1000 - date.getTime());
            if (diff < minDiff) {
              minDiff = diff;
              closest = candle;
            }
          }
          if (closest && closest.close) return parseFloat(closest.close);
        }
      }
    } catch { }
  }
  // Fallback CoinGecko
  if (!id) return null;
  try {
    // CoinGecko API: /coins/{id}/market_chart/range?vs_currency=usd&from=timestamp&to=timestamp
    const ts = Math.floor(date.getTime() / 1000);
    const from = ts - 60 * 60 * 3; // 3 horas antes
    const to = ts + 60 * 60 * 3;   // 3 horas después
    const res = await fetch(`${COINGECKO_API}/coins/${id}/market_chart/range?vs_currency=usd&from=${from}&to=${to}`);
    const data = await res.json();
    if (data && data.prices && data.prices.length) {
      // Buscar el precio más cercano al timestamp
      let minDiff = Infinity;
      let closestPrice = null;
      for (const [priceTs, price] of data.prices) {
        const diff = Math.abs(priceTs - date.getTime());
        if (diff < minDiff) {
          minDiff = diff;
          closestPrice = price;
        }
      }
      // Si es USD0 y no hay precio, asumir 1
      if ((symbol.toUpperCase() === 'USD0') && (!closestPrice || closestPrice === 0)) return 1;
      return closestPrice;
    }
    // Si es USD0 y no hay precio, asumir 1
    if (symbol.toUpperCase() === 'USD0') return 1;
    return null;
  } catch {
    if (symbol.toUpperCase() === 'USD0') return 1;
    return null;
  }
}

document.getElementById('btnFetchWallet').addEventListener('click', async () => {
  const address = document.getElementById('walletAddress').value.trim();
  const walletDataEl = document.getElementById('walletData');
  if (!address) return alert('Por favor ingresa una dirección válida.');

  walletDataEl.innerHTML = '<div class="wallet-loading">Cargando balances...</div>';
  try {
    // Balance ETH
    const res = await fetch(`${ETH_API}?chainid=1&module=account&action=balance&address=${address}&tag=latest&apikey=${ETH_KEY}`);
    const json = await res.json();
    if (json.status !== '1') throw new Error(json.message);
    const ethBal = (parseInt(json.result) / 1e18).toFixed(6);
    const ethPrice = await getEthPriceUSD();
    let assets = [{
      name: 'Ethereum',
      symbol: 'ETH',
      amount: ethBal,
      price: ethPrice,
      total: ethPrice ? (ethBal * ethPrice) : 0,
      change24h: null
    }];
    // Transacciones de tokens ERC20
    const txRes = await fetch(`${ETH_API}?chainid=1&module=account&action=tokentx&address=${address}&sort=desc&apikey=${ETH_KEY}`);
    const txJson = await txRes.json();
    const tokens = {};
    txJson.result.forEach(t => {
      tokens[t.contractAddress] = { symbol: t.tokenSymbol, decimals: t.tokenDecimal };
    });
    // Mostrar balances de hasta 20 tokens
    const addrs = Object.keys(tokens).slice(0, 20);
    for (let c of addrs) {
      const token = tokens[c];
      const bRes = await fetch(`${ETH_API}?chainid=1&module=account&action=tokenbalance&contractaddress=${c}&address=${address}&tag=latest&apikey=${ETH_KEY}`);
      const bJson = await bRes.json();
      const val = (parseInt(bJson.result) / 10 ** token.decimals);
      const price = await getTokenPriceUSD(token.symbol);
      assets.push({
        name: token.symbol,
        symbol: token.symbol,
        amount: val,
        price: price,
        total: price ? (val * price) : 0,
        change24h: null
      });
    }
    // --- NUEVO: Mostrar posiciones DeFi ---
    let defiPositions = [];
    let defiTotal = 0;
    try {
      const defiRes = await fetch(`https://api.covalenthq.com/v1/1/address/${address}/staking_v2/?key=${COVALENT_API_KEY}`);
      const defiJson = await defiRes.json();
      if (defiJson.data && defiJson.data.items && defiJson.data.items.length) {
        defiPositions = defiJson.data.items.map(pos => ({
          protocol: pos.protocol_name,
          pool: pos.pool_name || '',
          token: pos.balance_token_symbol || '',
          amount: pos.balance_token_balance || '',
          usd: pos.balance_quote ? Number(pos.balance_quote) : 0
        }));
        defiTotal = defiPositions.reduce((acc, p) => acc + (p.usd || 0), 0);
      }
    } catch { }
    // --- FIN NUEVO ---
    // Calcular total assets
    const assetsTotal = assets.reduce((acc, a) => acc + (a.total || 0), 0);
    // --- HTML ---
    let html = `<div class="wallet-dashboard" style="padding:18px 8px 10px 8px;">
      <div class="wallet-totals" style="margin-bottom:10px;">
        <div class="wallet-total-title">Total Worth</div>
        <div class="wallet-total-usd">$${(assetsTotal + defiTotal).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
        <div class="wallet-total-sub" style="margin-bottom:6px;">Assets: $${assetsTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} &nbsp; | &nbsp; DeFi: $${defiTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
      </div>
      <div class="wallet-assets-card" style="margin-bottom:10px;padding:10px 6px 8px 6px;">
        <div class="wallet-section-title" style="margin-bottom:4px;margin-top:0;">Assets</div>
        <table class="wallet-assets-table">
          <thead><tr><th>Name</th><th>Amount</th><th>Price</th><th>Total</th></tr></thead>
          <tbody>
            ${assets.map(a => {
      // Iconos personalizados
      let icon = '';
      if (a.symbol === 'USUAL') icon = '<img src="https://app.usual.money/tokens/USUAL.webp" alt="USUAL" style="width:18px;height:18px;vertical-align:middle;margin-right:4px;">';
      else if (a.symbol === 'USUALX') icon = '<img src="https://static.coinstats.app/coins/usualxXxe.png" alt="USUALX" style="width:18px;height:18px;vertical-align:middle;margin-right:4px;">';
      else if (a.symbol === 'USD0') icon = '<img src="https://static.coinstats.app/coins/usual-usdE9O.png" alt="USD0" style="width:18px;height:18px;vertical-align:middle;margin-right:4px;">';
      const price = (a.symbol === 'USUAL' || a.symbol === 'USUALX' || a.symbol === 'USD0')
        ? a.price ? '$' + a.price.toFixed(4) : '-'
        : a.price ? '$' + a.price.toFixed(2) : '-';
      // Mostrar amount de USUALX con solo 2 decimales
      const amount = a.symbol === 'USUALX'
        ? a.amount.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })
        : a.amount.toLocaleString(undefined, { maximumFractionDigits: 4, minimumFractionDigits: 0 });
      return `<tr><td>${icon}${a.symbol === 'USUALX' ? 'USUALx' : a.name}</td><td>${amount}</td><td>${price}</td><td>${a.total ? '$' + a.total.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'}</td></tr>`;
    }).join('')}
          </tbody>
        </table>
      </div>
      ${defiPositions.length ? `<div class="wallet-defi-card" style="margin-bottom:10px;padding:10px 6px 8px 6px;">
        <div class="wallet-section-title" style="margin-bottom:4px;margin-top:0;">DeFi</div>
        <table class="wallet-defi-table">
          <thead><tr><th>Protocol</th><th>Pool</th><th>Token</th><th>Amount</th><th>USD Value</th></tr></thead>
          <tbody>
            ${defiPositions.map(p => `<tr><td>${p.protocol}</td><td>${p.pool}</td><td>${p.token}</td><td>${p.amount}</td><td>${p.usd ? '$' + p.usd.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}
    </div>`;
    walletDataEl.innerHTML = html;

    // --- Sincronizar dirección con transacciones ---
    if (window.fetchAndShowTransactions) {
      window.fetchAndShowTransactions(address);
    }
  } catch (err) {
    walletDataEl.innerHTML = `<div class="wallet-error">Error: ${err.message}</div>`;
  }
});

// Sugerencias de monedas (Binance)
let coinsList = [];
async function fetchCoinsList() {
  const res = await fetch(`${BINANCE_API}/exchangeInfo`);
  const data = await res.json();
  coinsList = data.symbols.filter(s => s.quoteAsset === 'USDT').map(s => ({
    symbol: s.symbol,
    base: s.baseAsset,
    quote: s.quoteAsset
  }));
}
fetchCoinsList();

pairSearch.addEventListener('input', () => {
  const q = pairSearch.value.trim().toUpperCase();
  if (!q) {
    pairSuggestions.classList.remove('active');
    return;
  }
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
  if (!pairSuggestions.contains(e.target) && e.target !== pairSearch) {
    pairSuggestions.classList.remove('active');
  }
});

function addTrackedPair(symbol) {
  if (!tracked.includes(symbol)) {
    tracked.push(symbol);
    localStorage.setItem('trackedPairs', JSON.stringify(tracked));
    renderSingleTrackedPair(symbol);
  }
}

async function renderSingleTrackedPair(symbol) {
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

// Obtener datos de 24h de Binance
async function fetch24hStats(symbol) {
  if (symbol === 'CTXCUSDT') {
    try {
      const res = await fetch(`${HTX_API}/market/detail?symbol=ctxcusdt`);
      const data = await res.json();
      if (!data.tick) return {};
      return {
        priceChange: (data.tick.close - data.tick.open).toFixed(6),
        priceChangePercent: ((data.tick.close - data.tick.open) / data.tick.open * 100).toFixed(2),
        highPrice: data.tick.high,
        lowPrice: data.tick.low,
        volume: data.tick.amount,
        quoteVolume: data.tick.vol,
      };
    } catch {
      return {};
    }
  }
  const res = await fetch(`${BINANCE_API}/ticker/24hr?symbol=${symbol}`);
  return await res.json();
}

function getCoinName(symbol) {
  const base = symbol.replace('USDT', '').toUpperCase();
  const names = {
    BTC: 'Bitcoin', ETH: 'Ethereum', USDT: 'Tether', BNB: 'BNB', SOL: 'Solana', ADA: 'Cardano', XRP: 'XRP', DOGE: 'Dogecoin', MATIC: 'Polygon', TRX: 'TRON', LINK: 'Chainlink', LTC: 'Litecoin', DOT: 'Polkadot', SHIB: 'Shiba Inu', USDC: 'USD Coin', AVAX: 'Avalanche', OP: 'Optimism', ARB: 'Arbitrum', PEPE: 'Pepe',
    // Agrega más si lo deseas
  };
  return names[base] || base;
}

async function renderTrackedPairs() {
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
  // Para acceso global al eliminar
  window.removeTrackedPair = removeTrackedPair;
  // Click para ver detalles
  document.querySelectorAll('.tracked-pair').forEach(el => {
    el.onclick = () => showPairDetails(el.dataset.symbol);
  });
}

// --- HTX API para CTXCUSDT ---
const HTX_API = 'https://api.huobi.pro';

async function fetchPrice(symbol) {
  if (symbol === 'CTXCUSDT') {
    try {
      const res = await fetch(`${HTX_API}/market/detail/merged?symbol=ctxcusdt`);
      const data = await res.json();
      return data.tick && data.tick.close ? data.tick.close : '0.00';
    } catch {
      return '0.00';
    }
  }
  try {
    const res = await fetch(`${BINANCE_API}/ticker/price?symbol=${symbol}`);
    const data = await res.json();
    return data.price;
  } catch {
    return '0.00';
  }
}

async function fetchHTXCandles(symbol, interval) {
  // interval: 1day, 4hour, 1hour, 15min
  const map = { '1d': '1day', '4h': '4hour', '1h': '60min', '15m': '15min' };
  const res = await fetch(`${HTX_API}/market/history/kline?period=${map[interval]}&size=500&symbol=ctxcusdt`);
  const data = await res.json();
  // HTX devuelve los datos en orden descendente, invertir
  return (data.data || []).reverse();
}

async function renderCandlestick(symbol, interval) {
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
  if (symbol === 'CTXCUSDT') {
    const data = await fetchHTXCandles(symbol, interval);
    let start = Math.max(0, data.length - chartZoom);
    let end = data.length;
    const chartData = data.slice(start, end).map(d => ({
      x: d.id * 1000, // HTX da timestamp en segundos
      o: d.open,
      h: d.high,
      l: d.low,
      c: d.close
    }));
    chartInstance = new Chart(candlestickChart.getContext('2d'), {
      type: 'candlestick',
      data: {
        datasets: [{
          label: symbol,
          data: chartData,
          upColor: '#1ECB81',
          downColor: '#E74C4C',
          borderColor: '#181A20',
          borderWidth: 1.5,
          wickColor: {
            up: '#1ECB81',
            down: '#E74C4C',
            unchanged: '#F4F4F4'
          },
          wickWidth: 2
        }]
      },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
        },
        scales: {
          x: {
            type: 'time',
            time: { unit: interval === '1d' ? 'day' : (interval === '4h' || interval === '1h') ? 'hour' : 'minute' },
            grid: { color: '#353945' },
            ticks: { color: '#F4F4F4' }
          },
          y: {
            grid: { color: '#353945' },
            ticks: { color: '#F4F4F4' }
          }
        },
        backgroundColor: '#181A20',
        responsive: true,
        maintainAspectRatio: false,
        aspectRatio: 2,
        animation: false
      },
      plugins: [crosshairPlugin]
    });
    // Scroll y pan igual que antes
    candlestickChart.onwheel = (e) => {
      e.preventDefault();
      if (e.deltaY < 0) {
        chartZoom = Math.max(10, chartZoom - 10);
      } else {
        chartZoom = Math.min(chartZoom + 10, data.length);
      }
      renderCandlestick(symbol, interval);
    };
    let isPanning = false;
    let panStartX = 0;
    let panStartIndex = start;
    candlestickChart.onmousedown = (e) => {
      isPanning = true;
      panStartX = e.clientX;
      panStartIndex = start;
    };
    window.onmouseup = () => { isPanning = false; };
    candlestickChart.onmousemove = (e) => {
      if (isPanning) {
        const dx = e.clientX - panStartX;
        const moveBars = Math.round(dx / 3);
        let newStart = panStartIndex - moveBars;
        newStart = Math.max(0, Math.min(data.length - chartZoom, newStart));
        start = newStart;
        end = start + chartZoom;
        if (end > data.length) {
          end = data.length;
          start = Math.max(0, end - chartZoom);
        }
        if (start < 0) {
          start = 0;
          end = Math.min(data.length, chartZoom);
        }
        const newChartData = data.slice(start, end).map(d => ({
          x: d.id * 1000, o: d.open, h: d.high, l: d.low, c: d.close
        }));
        chartInstance.data.datasets[0].data = newChartData;
        chartInstance.update('none');
      }
    };
    return;
  }
  const intervalMap = { '1d': '1d', '4h': '4h', '1h': '1h', '15m': '15m' };
  const res = await fetch(`${BINANCE_API}/klines?symbol=${symbol}&interval=${intervalMap[interval]}&limit=500`);
  const data = await res.json();
  let start = Math.max(0, data.length - chartZoom);
  let end = data.length;
  const chartData = data.slice(start, end).map(d => ({
    x: d[0],
    o: parseFloat(d[1]),
    h: parseFloat(d[2]),
    l: parseFloat(d[3]),
    c: parseFloat(d[4])
  }));
  chartInstance = new Chart(candlestickChart.getContext('2d'), {
    type: 'candlestick',
    data: {
      datasets: [{
        label: symbol,
        data: chartData,
        upColor: '#1ECB81',
        downColor: '#E74C4C',
        borderColor: '#181A20',
        borderWidth: 1.5,
        wickColor: {
          up: '#1ECB81',
          down: '#E74C4C',
          unchanged: '#F4F4F4'
        },
        wickWidth: 2
      }]
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
      },
      scales: {
        x: {
          type: 'time',
          time: { unit: interval === '1d' ? 'day' : (interval === '4h' || interval === '1h') ? 'hour' : 'minute' },
          grid: { color: '#353945' },
          ticks: { color: '#F4F4F4' }
        },
        y: {
          grid: { color: '#353945' },
          ticks: { color: '#F4F4F4' }
        }
      },
      backgroundColor: '#181A20',
      responsive: true,
      maintainAspectRatio: false,
      aspectRatio: 2,
      animation: false
    },
    plugins: [crosshairPlugin]
  });
  // Scroll para zoom horizontal (invertido)
  candlestickChart.onwheel = (e) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      chartZoom = Math.max(10, chartZoom - 10);
    } else {
      chartZoom = Math.min(chartZoom + 10, data.length);
    }
    renderCandlestick(symbol, interval);
  };
  // Pan horizontal con arrastre (adelante y atrás en el tiempo)
  let isPanning = false;
  let panStartX = 0;
  let panStartIndex = start;
  candlestickChart.onmousedown = (e) => {
    isPanning = true;
    panStartX = e.clientX;
    panStartIndex = start;
  };
  window.onmouseup = () => { isPanning = false; };
  candlestickChart.onmousemove = (e) => {
    if (isPanning) {
      const dx = e.clientX - panStartX;
      const moveBars = Math.round(dx / 3);
      let newStart = panStartIndex - moveBars;
      newStart = Math.max(0, Math.min(data.length - chartZoom, newStart));
      start = newStart;
      end = start + chartZoom;
      if (end > data.length) {
        end = data.length;
        start = Math.max(0, end - chartZoom);
      }
      if (start < 0) {
        start = 0;
        end = Math.min(data.length, chartZoom);
      }
      const newChartData = data.slice(start, end).map(d => ({
        x: d[0], o: parseFloat(d[1]), h: parseFloat(d[2]), l: parseFloat(d[3]), c: parseFloat(d[4])
      }));
      chartInstance.data.datasets[0].data = newChartData;
      chartInstance.update('none');
    }
  };
}

// Al cargar la página, renderizar los pares guardados
renderTrackedPairs();

// Actualizar precios y variación cada 5 segundos
setInterval(async () => {
  const priceSpans = document.querySelectorAll('.pair-price');
  for (const span of priceSpans) {
    const symbol = span.getAttribute('data-symbol');
    const price = await fetchPrice(symbol);
    const stats = await fetch24hStats(symbol);
    span.textContent = formatPrice(price);
    // Actualizar variación
    const changeSpans = document.querySelectorAll(`.pair-change[data-symbol="${symbol}"]`);
    if (changeSpans && stats && stats.priceChangePercent !== undefined) {
      const pct = parseFloat(stats.priceChangePercent);
      const change = pct.toFixed(2) + '%';
      const changeClass = pct > 0 ? 'positive' : (pct < 0 ? 'negative' : '');
      const changeIcon = pct > 0 ? '<span class="arrow-up" style="vertical-align:middle;">▲</span>' : (pct < 0 ? '<span class="arrow-down" style="vertical-align:middle;">▼</span>' : '');
      changeSpans.forEach(changeSpan => {
        changeSpan.innerHTML = `${changeIcon}${change}`;
        changeSpan.className = `pair-change ${changeClass}`;
      });
    }
  }
}, 5000);

// Configuración global de colores de velas (para Chart.js Financial por CDN)
if (window.Chart && window.Chart.defaults && window.Chart.defaults.elements && window.Chart.defaults.elements.candlestick) {
  window.Chart.defaults.elements.candlestick.color = {
    up: '#1ECB81',      // Verde fuerte
    down: '#E74C4C',    // Rojo fuerte
    unchanged: '#F4F4F4'
  };
  window.Chart.defaults.elements.candlestick.borderColor = {
    up: '#1ECB81',
    down: '#E74C4C',
    unchanged: '#F4F4F4'
  };
}

// --- Gestión de billeteras guardadas ---
function getSavedWallets() {
  return JSON.parse(localStorage.getItem('savedWallets') || '[]');
}
function saveWallet(address) {
  let wallets = getSavedWallets();
  if (!wallets.includes(address)) {
    wallets.push(address);
    localStorage.setItem('savedWallets', JSON.stringify(wallets));
  }
}
function renderSavedWallets(selectedAddress = null) {
  const select = document.getElementById('savedWallets');
  if (!select) return;
  let wallets = getSavedWallets();
  // Filtrar solo strings válidos (direcciones ETH)
  wallets = wallets.filter(w => typeof w === 'string' && /^0x[a-fA-F0-9]{40}$/.test(w));
  // Si hubo datos corruptos, limpiar localStorage
  localStorage.setItem('savedWallets', JSON.stringify(wallets));
  select.innerHTML = wallets.length ? wallets.map(w => `<option value="${w}">${w}</option>`).join('') : '<option value="">(Sin billeteras guardadas)</option>';
  if (wallets.length) {
    select.value = selectedAddress || wallets[wallets.length - 1];
  }
}
// Al cargar, renderiza billeteras guardadas y consulta la última si existe
renderSavedWallets();
const walletsOnLoad = getSavedWallets();
if (walletsOnLoad.length) {
  document.getElementById('walletAddress').value = walletsOnLoad[walletsOnLoad.length - 1];
  document.getElementById('btnFetchWallet').click();
}

document.getElementById('btnSaveWallet').addEventListener('click', () => {
  const address = document.getElementById('walletAddress').value.trim();
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    alert('Dirección no válida');
    return;
  }
  saveWallet(address);
  renderSavedWallets(address);
  document.getElementById('walletAddress').value = address;
  document.getElementById('btnFetchWallet').click();
});

document.getElementById('savedWallets').addEventListener('change', (e) => {
  const address = e.target.value;
  if (address) {
    document.getElementById('walletAddress').value = address;
    document.getElementById('btnFetchWallet').click();
  }
});

document.getElementById('btnDeleteWallet').addEventListener('click', () => {
  const select = document.getElementById('savedWallets');
  const address = select.value;
  if (!address) return;
  let wallets = getSavedWallets();
  wallets = wallets.filter(w => w !== address);
  localStorage.setItem('savedWallets', JSON.stringify(wallets));
  renderSavedWallets();
  document.getElementById('walletAddress').value = '';
  document.getElementById('walletData').innerHTML = '';
});

document.getElementById('btnCopyWallet').addEventListener('click', async () => {
  const select = document.getElementById('savedWallets');
  const address = select.value;
  if (!address) return;
  try {
    await navigator.clipboard.writeText(address);
    const btn = document.getElementById('btnCopyWallet');
    const originalIcon = btn.innerHTML;
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d='M5 10.5L9 14.5L15 7.5' stroke='#45b26b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/></svg>`;
    setTimeout(() => {
      btn.innerHTML = originalIcon;
    }, 1200);
  } catch {
    alert('No se pudo copiar');
  }
});

// Detalles y gráfico de velas
async function showPairDetails(symbol) {
  currentPair = symbol;
  pairDetails.classList.remove('hidden');
  // Obtener precio y stats
  const price = await fetchPrice(symbol);
  const stats = await fetch24hStats(symbol);
  const base = symbol.replace('USDT', '');
  const change = parseFloat(stats.priceChange);
  const changePct = parseFloat(stats.priceChangePercent);
  const changeClass = change > 0 ? 'positive' : (change < 0 ? 'negative' : '');
  // Mostrar título con precio y variación
  pairTitle.innerHTML = `${symbol.replace('USDT', '')}/USDT <span class="pair-price-inline">$${formatPrice(price)}</span> <span class="pair-change-inline ${changeClass}">${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%</span>`;
  // Limpiar stats previos
  const oldStats = document.querySelector('.pair-stats');
  if (oldStats) oldStats.remove();
  // Mostrar stats 24h
  const high = parseFloat(stats.highPrice);
  const low = parseFloat(stats.lowPrice);
  const volBase = parseFloat(stats.volume);
  const volUSDT = parseFloat(stats.quoteVolume);
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

intervalSelector.addEventListener('click', (e) => {
  if (e.target.tagName === 'BUTTON') {
    currentInterval = e.target.dataset.interval;
    window.currentInterval = currentInterval;
    intervalSelector.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    if (currentPair) renderCandlestick(currentPair, currentInterval);
  }
});

// --- Transacciones ETH/ERC20 sección aparte ---
document.addEventListener('DOMContentLoaded', () => {
  const ETH_API = 'https://api.etherscan.io/api';
  const ETH_KEY = 'F7F8ZYHRFCQU3CC3H8R15A5E3NN5GH1CU4';
  let txList = [], offset = 0, priceMap = {};
  let currentTxAddress = null; // Nueva variable global para la dirección

  // Agregar event listener para el botón de cierre
  document.getElementById('close-details').addEventListener('click', () => {
    pairDetails.classList.add('hidden');
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
  });

  async function initPrices() {
    const prices = await fetch('https://api.binance.com/api/v3/ticker/price').then(r => r.json());
    prices.forEach(p => priceMap[p.symbol] = +p.price);
  }

  function fmt(n, d = 2) { return Number(n).toLocaleString('en', { minimumFractionDigits: d, maximumFractionDigits: d }); }

  async function loadTx() {
    const slice = txList.slice(offset, offset + 10);
    const tbody = document.getElementById('txBody');
    // Agrupar por fecha
    const grouped = {};
    for (const tx of slice) {
      const date = new Date(tx.timeStamp * 1000).toLocaleDateString('es-ES');
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(tx);
    }
    const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    for (const date of Object.keys(grouped)) {
      // Formato de fecha: 21 Abril, 2025
      const [day, month, year] = date.split('/');
      const dateObj = new Date(`${year}-${month}-${day}`);
      const dateStr = `${parseInt(day)} ${monthNames[dateObj.getMonth()]}${year ? ', ' + year : ''}`;
      // Fila de fecha (cabecera, sin encabezado extra)
      const dateDiv = document.createElement('tr');
      dateDiv.className = 'tx-date-row';
      dateDiv.innerHTML = `<td colspan='8'>${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)}</td>`;
      tbody.appendChild(dateDiv);
      // Encabezado de tags solo una vez por fecha
      const tagsRow = document.createElement('tr');
      tagsRow.className = 'tx-list-tags';
      tagsRow.innerHTML = `
        <td>tipo</td>
        <td>token</td>
        <td>cantidad</td>
        <td>USD / P&L</td>
      `;
      tbody.appendChild(tagsRow);
      // Transacciones de esa fecha
      for (const tx of grouped[date]) {
        const addr = currentTxAddress ? currentTxAddress.toLowerCase() : '';
        const isSent = tx.from.toLowerCase() === addr;
        const type = isSent ? 'Sent' : 'Received';
        const sym = tx.tokenSymbol || 'ETH';
        const dec = tx.tokenDecimal || 18;
        const amt = parseInt(tx.value) / 10 ** dec;
        // Iconos personalizados para tokens
        let icon = '';
        if (sym === 'USUAL') icon = '<img src="https://app.usual.money/tokens/USUAL.webp" alt="USUAL" style="width:16px;height:16px;vertical-align:middle;margin-right:3px;">';
        else if (sym === 'USUALX') icon = '<img src="https://static.coinstats.app/coins/usualxXxe.png" alt="USUALX" style="width:16px;height:16px;vertical-align:middle;margin-right:3px;">';
        else if (sym === 'USD0') icon = '<img src="https://static.coinstats.app/coins/usual-usdE9O.png" alt="USD0" style="width:16px;height:16px;vertical-align:middle;margin-right:3px;">';
        // Cantidad con color y signo
        let amountText = isSent
          ? `<span class='tx-amount sent'>- ${fmt(amt, 2)}</span>`
          : `<span class='tx-amount'>+ ${fmt(amt, 2)}</span>`;
        // Obtener precio en USD actual
        let priceUSD = 0;
        if (sym === 'ETH') {
          priceUSD = await getEthPriceUSD();
        } else if (sym === 'USUAL' || sym === 'USUALX' || sym === 'USD0') {
          priceUSD = await getTokenPriceUSD(sym);
        } else {
          priceUSD = priceMap[sym + 'USDT'] || 0;
        }
        let usd = amt * (priceUSD || 0);
        // Obtener precio histórico y detalles
        const txDateObj = new Date(tx.timeStamp * 1000);
        let priceHist = null;
        let lowPrec = "";
        let minDiff = Infinity;
        let triedCoinStats = false;
        if (sym === 'USUALX' || sym === 'USD0') {
          triedCoinStats = true;
          try {
            const coinId = sym === 'USUALX' ? 'usualx' : 'usd0';
            const res = await fetch(`https://api.coinstats.app/public/v1/charts?period=all&coinId=${coinId}`);
            const data = await res.json();
            if (data && data.chart && data.chart.length) {
              let closest = null;
              let closestTs = null;
              const txTs = txDateObj.getTime();
              for (const [priceTs, price] of data.chart) {
                const priceTsMs = priceTs * 1000;
                const diff = Math.abs(priceTsMs - txTs);
                if (diff < minDiff) {
                  minDiff = diff;
                  closest = price;
                  closestTs = priceTsMs;
                }
              }
              if (closest && closest > 0) priceHist = parseFloat(closest);
              if (minDiff > 24 * 60 * 60 * 1000) {
                lowPrec = "<span title='El precio histórico puede no ser preciso (no es del mismo día)' style='color:#e7c000;font-size:1em;margin-left:4px;'>⚠️</span>";
              }
            }
          } catch { }
        }
        if ((!priceHist || priceHist === 0) && (sym === 'USUALX' || sym === 'USD0')) {
          try {
            const custom = customTokens.find(t => t.symbol === sym);
            if (custom) {
              const tokenAddress = custom.address;
              const pairRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
              const pairData = await pairRes.json();
              const pair = (pairData.pairs || []).find(p => p.baseToken.address.toLowerCase() === tokenAddress.toLowerCase() && p.quoteToken.symbol === 'USDT' && p.chainId === 'ethereum');
              if (pair && pair.pairAddress) {
                const ts = Math.floor(txDateObj.getTime() / 1000);
                const from = ts - 60 * 60 * 24; // 24h antes
                const to = ts + 60 * 60 * 24;   // 24h después
                const candlesRes = await fetch(`https://api.dexscreener.com/latest/dex/pairs/ethereum/${pair.pairAddress}/candles?interval=1h&from=${from}&to=${to}`);
                const candlesData = await candlesRes.json();
                if (candlesData && candlesData.candles && candlesData.candles.length) {
                  let minDiffDex = Infinity;
                  let closestDex = null;
                  for (const candle of candlesData.candles) {
                    const diff = Math.abs(candle.timestamp * 1000 - txDateObj.getTime());
                    if (diff < minDiffDex) {
                      minDiffDex = diff;
                      closestDex = candle;
                    }
                  }
                  if (closestDex && closestDex.close) priceHist = parseFloat(closestDex.close);
                  if (minDiffDex > 24 * 60 * 60 * 1000) {
                    lowPrec = "<span title='El precio histórico puede no ser preciso (no es del mismo día)' style='color:#e7c000;font-size:1em;margin-left:4px;'>⚠️</span>";
                  }
                }
              }
            }
          } catch { }
        }
        if (!priceHist || priceHist === 0) {
          let fallbackHist = await getHistoricalTokenPriceUSD(sym, txDateObj, true); // true = forzar fallback, evita CoinStats
          if (fallbackHist && fallbackHist > 0) priceHist = fallbackHist;
        }
        let noData = false;
        if (!priceHist || priceHist === 0) {
          noData = true;
          priceHist = null;
        }
        let usdHist = amt * (priceHist || 0);
        // P/L
        let pl = usd - usdHist;
        let plPct = usdHist ? (pl / usdHist) * 100 : 0;
        let plColor = pl > 0 ? '#1ecb81' : (pl < 0 ? '#e74c3c' : '#aaa');
        let plText = `<span class='tx-pl' style='color:${plColor};font-weight:600;'>${pl >= 0 ? '+' : ''}${pl.toLocaleString(undefined, { maximumFractionDigits: 2 })} (${plPct >= 0 ? '+' : ''}${plPct.toFixed(2)}%)</span>`;
        // Mostrar valor histórico debajo de cantidad
        let amountDetail = noData
          ? `<div class='tx-detail' style='color:#e74c3c;'>Sin datos históricos</div>`
          : `<div class='tx-detail'>$${usdHist.toLocaleString(undefined, { maximumFractionDigits: 2 })} (1 ${sym} = $${priceHist ? priceHist.toFixed(4) : '-'})${lowPrec}</div>`;
        // Render tipo lista compacta, sin tags repetidos
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
    document.getElementById('txTable').style.display = 'table';
    const btnMore = document.getElementById('btnLoadMore');
    if (offset < txList.length) { btnMore.parentElement.style.display = 'block'; } else { btnMore.parentElement.style.display = 'none'; }
  }

  // Nueva función para cargar transacciones por dirección
  async function fetchAndShowTransactions(address) {
    await initPrices();
    offset = 0; txList = [];
    document.getElementById('txBody').innerHTML = '';
    currentTxAddress = address;
    if (!address) return;
    const res = await fetch(`${ETH_API}?module=account&action=tokentx&address=${address}&sort=desc&apikey=${ETH_KEY}`);
    const data = await res.json(); txList = data.result || [];
    loadTx();
  }

  document.getElementById('btnLoadMore').addEventListener('click', loadTx);

  // Exponer la función globalmente para que la consulta de billetera la pueda llamar
  window.fetchAndShowTransactions = fetchAndShowTransactions;

  // --- Colapsar sección de transacciones ETH/ERC20 ---
  const ethTxHeader = document.getElementById('eth-transactions-header');
  const ethTxContent = document.getElementById('eth-transactions-content');
  const ethTxToggle = document.getElementById('toggle-eth-transactions');
  if (ethTxHeader && ethTxContent && ethTxToggle) {
    ethTxHeader.addEventListener('click', () => {
      if (ethTxContent.style.display === 'none') {
        ethTxContent.style.display = '';
        ethTxToggle.classList.remove('rotated');
      } else {
        ethTxContent.style.display = 'none';
        ethTxToggle.classList.add('rotated');
      }
    });
  }
});
