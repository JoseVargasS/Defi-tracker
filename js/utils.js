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

export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

export function safeImageUrl(value, fallback = '') {
  const url = String(value ?? '').trim();
  if (!url) return fallback;
  if (url.startsWith('./') || url.startsWith('/')) return url;

  try {
    const parsed = new URL(url);
    return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : fallback;
  } catch {
    return fallback;
  }
}

export function safeErrorMessage(error, fallback = 'Ocurrio un error al cargar los datos.') {
  const message = error?.message || String(error || '');
  if (!message || message.length > 180) return fallback;
  if (/[<>{}[\]();]/.test(message)) return fallback;
  return message;
}

export function showMessage(el, msg, type = 'info') {
  if (!el) return;
  const message = document.createElement('div');
  message.className = `msg ${String(type).replace(/[^a-z-]/gi, '') || 'info'}`;
  message.textContent = String(msg ?? '');
  el.replaceChildren(message);
}

function redactUrl(value) {
  try {
    const parsed = new URL(value);
    ['apikey', 'apiKey', 'key', 'token'].forEach(param => {
      if (parsed.searchParams.has(param)) parsed.searchParams.set(param, '[redacted]');
    });
    return parsed.toString();
  } catch {
    return '[invalid-url]';
  }
}

export async function makeRequest(url, options = {}, retryCount = 0) {
  try {
    const headers = { 'Accept': 'application/json', ...(options.headers || {}) };
    if (url.startsWith(COINSTATS_API)) headers['X-API-KEY'] = COINSTATS_API_KEY;
    const res = await fetch(url, { ...options, headers });
    
    if (res.status === 429 && retryCount < 1) {
      // Rate limited: wait 2 seconds and retry once
      await new Promise(r => setTimeout(r, 2000));
      return makeRequest(url, options, retryCount + 1);
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${res.statusText} ${txt}`);
    }
    const data = await res.json().catch(() => null);
    return data;
  } catch (err) {
    // Only log errors that aren't 400 (Bad Request) for unknown tokens
    // And don't log 429 if we're still going to fail after retry
    if (!err.message || (!err.message.includes('HTTP 400') && !err.message.includes('HTTP 429'))) {
      console.error('makeRequest error', redactUrl(url), safeErrorMessage(err));
    }
    throw err;
  }
}

