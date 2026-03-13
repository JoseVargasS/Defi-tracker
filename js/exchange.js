// js/exchange.js
import { BINANCE_API } from './config.js';
import { makeRequest } from './utils.js';
import { state } from './state.js';

export async function fetch24hStats(symbol) {
  try {
    const res = await makeRequest(`${BINANCE_API}/ticker/24hr?symbol=${symbol}`);
    return res;
  } catch {
    return {};
  }
}

export async function fetchPrice(symbol) {
  try {
    const res = await makeRequest(`${BINANCE_API}/ticker/price?symbol=${symbol}`);
    return res.price;
  } catch {
    return '0.00';
  }
}

// Nueva función de agrupación de velas (klines)
function aggregateKlines(rawKlines, groupSize) {
  const aggregated = [];
  for (let i = 0; i < rawKlines.length; i += groupSize) {
    const chunk = rawKlines.slice(i, i + groupSize);
    if (chunk.length < groupSize && aggregated.length > 0) {
      // Opcional: ignorar el último trozo si está incompleto, pero para tiempo real es mejor mostrarlo
    }

    const openTime = chunk[0][0]; // timestamp de inicio
    const open = parseFloat(chunk[0][1]);
    const close = parseFloat(chunk[chunk.length - 1][4]);

    let high = -Infinity;
    let low = Infinity;

    for (const candle of chunk) {
      const h = parseFloat(candle[2]);
      const l = parseFloat(candle[3]);
      if (h > high) high = h;
      if (l < low) low = l;
    }
    // Formato de retorno emulando Binance: [timestamp, open, high, low, close]
    aggregated.push([openTime, open.toString(), high.toString(), low.toString(), close.toString()]);
  }
  return aggregated;
}

// Nueva función: obtener klines de Binance correctamente (usa makeRequest)
export async function fetchKlines(symbol, interval) {
  const intervalMap = { '3M': '1M', '1M': '1M', '1w': '1w', '5d': '1d', '3d': '3d', '1d': '1d', '4h': '4h', '1h': '1h', '15m': '15m', '5m': '5m', '1m': '1m' };
  const qInterval = intervalMap[interval] || '1d';
  // Binance devuelve un array de arrays
  try {
    // Si la agrupación es grande (ej: 3M con velas de 1M), pedimos más historial si queremos 500 velas finales = 1500 limit
    const limit = interval === '3M' ? 1000 : (interval === '5d' ? 1000 : 1000);
    const res = await makeRequest(`${BINANCE_API}/klines?symbol=${symbol}&interval=${qInterval}&limit=${limit}`);

    let klines = res;
    if (interval === '3M') {
      klines = aggregateKlines(klines, 3);
    } else if (interval === '5d') {
      klines = aggregateKlines(klines, 5);
    }

    return klines; // normalmente es un array
  } catch (e) {
    console.error('fetchKlines error', e);
    return [];
  }
}

export async function fetchCoinsList() {
  try {
    const res = await makeRequest(`${BINANCE_API}/exchangeInfo`);
    const data = res;
    state.coinsList = (data.symbols || []).filter(s => s.quoteAsset === 'USDT').map(s => ({ symbol: s.symbol, base: s.baseAsset, quote: s.quoteAsset }));
  } catch (error) {
    console.error('Error fetching coins list:', error);
    state.coinsList = [];
  }
}
