// js/prices.js
import { COINSTATS_API } from './config.js';
import { makeRequest } from './utils.js';
import { state } from './state.js';

function isValidSymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') return false;
  const s = symbol.trim();
  if (s === '?' || s === '' || s.toUpperCase() === 'ERC20') return false;
  // If it's just special characters, it's invalid
  if (!/[a-zA-Z0-9]/.test(s)) return false;
  return true;
}

export async function getTokenPriceUSD(symbol) {
  try {
    if (!isValidSymbol(symbol)) return null;
    
    const s = symbol.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const key = `price-${s}`;
    
    if (state.pricesCache[key] !== undefined) return state.pricesCache[key];

    // Reuse pending request if any
    if (state.loadingRequests[key]) return state.loadingRequests[key];

    const promise = (async () => {
      let isRateLimited = false;
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

        if (/^[a-zA-Z0-9-]+$/.test(symbol)) {
          const url2 = `${COINSTATS_API}/coins/${encodeURIComponent(symbol.toLowerCase())}?currency=USD`;
          try {
            const r2 = await makeRequest(url2);
            if (r2 && typeof r2.price === 'number') {
              if (r2.id) state.coinLookupCache[symbol.toUpperCase()] = r2.id;
              return r2.price;
            }
          } catch (e) {
            if (e.message && e.message.includes('429')) isRateLimited = true;
          }
        }
        
        return null;
      } catch (e) {
        if (e.message && e.message.includes('429')) isRateLimited = true;
        return null;
      } finally {
        // If we finished the promise, we store the rate limit status on the promise object itself
        // so the caller can decide whether to cache null.
        promise.wasRateLimited = isRateLimited;
      }
    })();

    state.loadingRequests[key] = promise;
    const price = await promise;
    
    // Only cache if we got a result or if it's a "real" null (not rate limited)
    if (price !== null || !promise.wasRateLimited) {
       state.pricesCache[key] = price;
    }

    
    delete state.loadingRequests[key];
    return price;


  } catch (err) {
    return null;
  }
}


export async function getHistoricalTokenPriceUSD(symbol, date) {
  try {
    if (!isValidSymbol(symbol) || !date) return null;
    
    const s = symbol.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const cacheKey = `${s}-${Math.floor(date.getTime() / 1000 / 3600)}`;
    
    if (state.pricesCache[cacheKey] !== undefined) return state.pricesCache[cacheKey];

    // If we already tried this symbol and it has no price, don't try historical
    const currentPriceKey = `price-${s}`;
    if (state.pricesCache[currentPriceKey] === null) return null;

    // Reuse pending request for this specific historical price if any
    if (state.loadingRequests[cacheKey]) return state.loadingRequests[cacheKey];

    const promise = (async () => {
      let isRateLimited = false;
      try {
        let coinId = state.coinLookupCache[symbol.toUpperCase()];
        if (!coinId) {
          // Try to get coin ID via the current price lookup
          await getTokenPriceUSD(symbol);
          coinId = state.coinLookupCache[symbol.toUpperCase()];
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
                  } else {
                    state.historicalChartCache[coinId] = [];
                  }
                } catch (e) {
                  if (e.message && e.message.includes('429')) isRateLimited = true;
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
              if (diff < bestDiff) {
                bestDiff = diff;
                best = p;
              }
            }
            if (best && typeof best.price === 'number') return best.price;
          }
        }
        return null;
      } catch (e) {
        if (e.message && e.message.includes('429')) isRateLimited = true;
        return null;
      } finally {
        promise.wasRateLimited = isRateLimited;
      }
    })();

    state.loadingRequests[cacheKey] = promise;
    const histPrice = await promise;
    
    if (histPrice !== null || !promise.wasRateLimited) {
      state.pricesCache[cacheKey] = histPrice;
    }


  } catch (err) {
    return null;
  }
}

