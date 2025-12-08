// js/config.js
export const BINANCE_API = 'https://api.binance.com/api/v3';
export const COINSTATS_API = 'https://openapiv1.coinstats.app';
export const COINSTATS_API_KEY = 'zaahGoIVFiB69a4tlS5jIchyt+YYNNmMW4cdw0Lcto0=';
export const ETH_API = 'https://api.etherscan.io/v2/api';
export const ETH_KEY = '3UZBJN7R92B2QM1Q7PCGRY8JNJ4A55RDJT';
export const HTX_API = 'https://api.huobi.pro';

// Supported blockchain networks for wallet queries
export const SUPPORTED_CHAINS = [
  { id: 'ethereum', name: 'Ether', icon: '🔷' },
  { id: 'base-wallet', name: 'Base', icon: '🔵' },
  { id: 'binancesmartchain', name: 'BSC', icon: '🟡' },
  { id: 'polygon', name: 'Polygon', icon: '🟣' },
  { id: 'arbitrum', name: 'Arbitrum', icon: '🔷' },
  { id: 'optimism', name: 'Optimism', icon: '🔴' },
  { id: 'solana', name: 'Solana', icon: '🟢' }
];
