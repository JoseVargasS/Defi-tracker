// js/prices.js
import { COINSTATS_API } from './config.js';
import { makeRequest } from './utils.js';
import { state } from './state.js';

export async function getTokenPriceUSD(symbol) {
  try {
    if (!symbol) return null;
    const s = symbol.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (s === 'ERC20') return null;

    const key = `price-${s}`;
    if (state.pricesCache[key] !== undefined) return state.pricesCache[key];

    // Reuse pending request if any
    if (state.loadingRequests[key]) return state.loadingRequests[key];

    const promise = (async () => {
      try {
        const url = `${COINSTATS_API}/coins?symbol=${encodeURIComponent(symbol)}&currency=USD`;
        const res = await makeRequest(url);
        if (res && Array.isArray(res.result) && res.result.length) {
          const coin = res.result.find(c => (c.symbol || '').toUpperCase() === symbol.toUpperCase()) || res.result[0];
          if (coin && typeof coin.price === 'number') {
            if (coin.id) state.coinLookupCache[symbol.toUpperCase()] = coin.id;
            return coin.price;
          }
        }

        if (symbol.toUpperCase() === 'USD0') return 1;

        // fallback request by id
        const url2 = `${COINSTATS_API}/coins/${encodeURIComponent(symbol.toLowerCase())}?currency=USD`;
        const r2 = await makeRequest(url2);
        if (r2 && typeof r2.price === 'number') {
          if (r2.id) state.coinLookupCache[symbol.toUpperCase()] = r2.id;
          return r2.price;
        }
        return null;
      } catch (e) {
        return null;
      }
    })();

    state.loadingRequests[key] = promise;
    const price = await promise;
    state.pricesCache[key] = price;
    delete state.loadingRequests[key];
    return price;

  } catch (err) {
    if (err.message && !err.message.includes('400')) {
      console.warn('getTokenPriceUSD error', symbol, err.message);
    }
    return null;
  }
}

export async function getHistoricalTokenPriceUSD(symbol, date) {
  try {
    if (!symbol || !date) return null;
    const s = symbol.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (s === 'ERC20') return null;

    const cacheKey = `${s}-${Math.floor(date.getTime() / 1000 / 3600)}`;
    if (state.pricesCache[cacheKey] !== undefined) return state.pricesCache[cacheKey];

    // Reuse pending request for this specific historical price if any
    if (state.loadingRequests[cacheKey]) return state.loadingRequests[cacheKey];

    const promise = (async () => {
      let coinId = state.coinLookupCache[symbol.toUpperCase()];
      if (!coinId) {
        try {
          const url = `${COINSTATS_API}/coins?symbol=${encodeURIComponent(symbol)}&currency=USD`;
          const res = await makeRequest(url);
          if (res && Array.isArray(res.result) && res.result.length) {
            const coin = res.result.find(c => (c.symbol || '').toUpperCase() === symbol.toUpperCase()) || res.result[0];
            if (coin && coin.id) {
              coinId = coin.id;
              state.coinLookupCache[symbol.toUpperCase()] = coinId;
            }
          }
        } catch (e) { /* ignore */ }
      }

      if (coinId) {
        const chartKey = `chart-${coinId}`;
        if (!state.historicalChartCache[coinId]) {
          if (state.loadingRequests[chartKey]) {
              await state.loadingRequests[chartKey];
          } else {
              const chartPromise = (async () => {
                try {
                  const chartsUrl = `${COINSTATS_API}/coins/${encodeURIComponent(coinId)}/charts?period=all&currency=USD`;
                  const chartData = await makeRequest(chartsUrl);
                  if (Array.isArray(chartData) && chartData.length) {
                    state.historicalChartCache[coinId] = chartData.map(c => ({ ts: c[0], price: c[1] }));
                  } else state.historicalChartCache[coinId] = [];
                } catch (e) {
                  state.historicalChartCache[coinId] = [];
                }
              })();
              state.loadingRequests[chartKey] = chartPromise;
              await chartPromise;
              delete state.loadingRequests[chartKey];
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
          if (best && typeof best.price === 'number') return best.price;
        }
      }
      return null;
    })();

    state.loadingRequests[cacheKey] = promise;
    const histPrice = await promise;
    state.pricesCache[cacheKey] = histPrice;
    delete state.loadingRequests[cacheKey];
    return histPrice;

  } catch (err) {
    console.error('getHistoricalTokenPriceUSD error', symbol, err);
    return null;
  }
}
