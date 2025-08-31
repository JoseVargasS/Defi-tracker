// js/exchange.js
import { BINANCE_API, HTX_API } from './config.js';
import { makeRequest } from './utils.js';
import { state } from './state.js';

export async function fetch24hStats(symbol) {
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

export async function fetchPrice(symbol) {
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

export async function fetchHTXCandles(_symbol, interval) {
  const map = { '1d': '1day', '3d': '3day', '4h': '4hour', '1h': '60min', '15m': '15min', '5m': '5min', '1m': '1min' };
  const period = map[interval] || '1day';
  const res = await makeRequest(`${HTX_API}/market/history/kline?period=${period}&size=500&symbol=ctxcusdt`);
  const data = res;
  return (data.data || []).reverse();
}

// Nueva función: obtener klines de Binance correctamente (usa makeRequest)
export async function fetchKlines(symbol, interval) {
  const intervalMap = { '1d': '1d', '3d': '3d', '4h': '4h', '1h': '1h', '15m': '15m', '5m': '5m', '1m': '1m' };
  const qInterval = intervalMap[interval] || '1d';
  // Binance devuelve un array de arrays
  try {
    const res = await makeRequest(`${BINANCE_API}/klines?symbol=${symbol}&interval=${qInterval}&limit=500`);
    return res; // normalmente es un array
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
