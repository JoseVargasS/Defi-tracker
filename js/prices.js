// js/prices.js
import { COINSTATS_API } from './config.js';
import { makeRequest } from './utils.js';
import { state } from './state.js';

export async function getTokenPriceUSD(symbol) {
  try {
    if (!symbol) return null;
    const key = `price-${symbol.toUpperCase()}`;
    if (state.pricesCache[key]) return state.pricesCache[key];

    const url = `${COINSTATS_API}/coins?symbol=${encodeURIComponent(symbol)}&currency=USD`;
    const res = await makeRequest(url);
    if (res && Array.isArray(res.result) && res.result.length) {
      const coin = res.result.find(c => (c.symbol || '').toUpperCase() === symbol.toUpperCase()) || res.result[0];
      if (coin && typeof coin.price === 'number') {
        state.pricesCache[key] = coin.price;
        if (coin.id) state.coinLookupCache[symbol.toUpperCase()] = coin.id;
        return coin.price;
      }
    }

    if (symbol.toUpperCase() === 'USD0') {
      state.pricesCache[key] = 1;
      return 1;
    }

    // fallback request by id
    try {
      const url2 = `${COINSTATS_API}/coins/${encodeURIComponent(symbol.toLowerCase())}?currency=USD`;
      const r2 = await makeRequest(url2);
      if (r2 && typeof r2.price === 'number') {
        state.pricesCache[key] = r2.price;
        if (r2.id) state.coinLookupCache[symbol.toUpperCase()] = r2.id;
        return r2.price;
      }
    } catch (e) { /* ignore */ }

    return null;
  } catch (err) {
    console.error('getTokenPriceUSD error', symbol, err);
    return null;
  }
}

export async function getHistoricalTokenPriceUSD(symbol, date) {
  try {
    if (!symbol || !date) return null;
    const cacheKey = `${symbol.toUpperCase()}-${Math.floor(date.getTime() / 1000 / 3600)}`;
    if (state.pricesCache[cacheKey]) return state.pricesCache[cacheKey];

    let coinId = state.coinLookupCache[symbol.toUpperCase()];
    if (!coinId) {
      try {
        const url = `${COINSTATS_API}/coins?symbol=${encodeURIComponent(symbol)}&currency=USD`;
        const res = await makeRequest(url);
        if (r && Array.isArray(res.result) && r.result.length) {
          const coin = res.result.find(c => (c.symbol || '').toUpperCase() === symbol.toUpperCase()) || res.result[0];
          if (coin && coin.id) {
            coinId = coin.id;
            state.coinLookupCache[symbol.toUpperCase()] = coinId;
          }
        }
      } catch (e) { /* ignore */ }
    }

    if (coinId) {
      if (!state.historicalChartCache[coinId]) {
        try {
          const chartsUrl = `${COINSTATS_API}/coins/${encodeURIComponent(coinId)}/charts?period=all&currency=USD`;
          const chartData = await makeRequest(chartsUrl);
          if (Array.isArray(chartData) && chartData.length) {
            state.historicalChartCache[coinId] = chartData.map(c => ({ ts: c[0], price: c[1] }));
          } else state.historicalChartCache[coinId] = [];
        } catch (e) {
          state.historicalChartCache[coinId] = [];
        }
      }
      const list = state.historicalChartCache[coinId];
      if (list && list.length) {
        const target = Math.floor(date.getTime() / 1000);
        let best = null, bestDiff = Infinity;
        for (const p of list) {
          const diff = Math.abs(p.ts - target);
          if (diff < bestDiff) { bestDiff = diff; best = p; }
        }
        if (best && typeof best.price === 'number') {
          state.pricesCache[cacheKey] = best.price;
          return best.price;
        }
      }
    }

    // fallback for contract address handled in exchange if needed
    return null;
  } catch (err) {
    console.error('getHistoricalTokenPriceUSD error', symbol, err);
    return null;
  }
}
