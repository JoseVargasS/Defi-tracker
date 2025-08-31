// js/state.js
export const state = {
  tracked: [],
  chartInstance: null,
  currentPair: null,
  currentInterval: '1d',
  chartZoom: 60,
  lastPrices: {},
  coinIcons: {},
  pricesCache: {},
  historicalChartCache: {},
  coinLookupCache: {},
  candleRenderLock: false,
  coinsList: []
};

export const names = { BTC: 'BTC', ETH: 'ETH', USDT: 'Tether', BNB: 'BNB', SOL: 'Solana', ADA: 'Cardano', XRP: 'XRP', DOGE: 'Dogecoin', MATIC: 'Polygon', TRX: 'TRON', LINK: 'Chainlink', LTC: 'Litecoin', DOT: 'Polkadot', SHIB: 'Shiba Inu', USDC: 'USD Coin', AVAX: 'Avalanche', OP: 'Optimism', ARB: 'Arbitrum', PEPE: 'Pepe' };

export const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
