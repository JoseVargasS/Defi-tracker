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

// Nueva función: obtener klines de Binance correctamente (usa makeRequest)
export async function fetchKlines(symbol, interval) {
  const intervalMap = { '1d': '1d', '3d': '3d', '4h': '4h', '1h': '1h', '15m': '15m', '5m': '5m', '1m': '1m' };
  const qInterval = intervalMap[interval] || '1d';
  // Binance devuelve un array de arrays
  try {
    const res = await makeRequest(`${BINANCE_API}/klines?symbol=${symbol}&interval=${qInterval}&limit=1000`);
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
