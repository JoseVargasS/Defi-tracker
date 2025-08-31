// js/utils.js
import { COINSTATS_API, COINSTATS_API_KEY } from './config.js';

export function formatPrice(price) {
  price = parseFloat(price);
  if (isNaN(price)) return '-';
  return price < 1 ? price.toFixed(4) : price.toFixed(2);
}

export function fmt(n, d = 2) {
  return Number(n).toLocaleString('en', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function showMessage(el, msg, type = 'info') {
  if (!el) return;
  el.innerHTML = `<div class="msg ${type}">${msg}</div>`;
}

export async function makeRequest(url, options = {}) {
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
