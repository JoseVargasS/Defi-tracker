// js/main.js
//Importa todo y hace el DOMContentLoaded (reemplaza el app.js original).
import { state } from './state.js';
import { formatPrice } from './utils.js';
import { fetchCoinsList, fetchPrice, fetch24hStats } from './exchange.js';
import { renderTrackedPairs, addTrackedPair, removeTrackedPair, createPairHtml, renderCandlestick } from './pairs.js';
import { renderSavedWallets, saveWallet, fetchAndRenderWallet, getSavedWallets } from './wallet.js';
import { fetchAndShowTransactions, loadTx } from './transactions.js';

document.addEventListener('DOMContentLoaded', async function () {

  // Suppress "User rejected the request" errors from external wallet extensions
  window.addEventListener('unhandledrejection', function (event) {
    if (event.reason && (event.reason.code === 4001 || (event.reason.message && event.reason.message.includes('User rejected')))) {
      event.preventDefault();
      console.log('Aviso: Se ignoró un error de conexión de billetera externa (esperado en dApps sin conexión Web3).');
    }
  });

  // Restaurar tracked pairs
  if (localStorage.getItem('trackedPairs')) {
    try { state.tracked = JSON.parse(localStorage.getItem('trackedPairs')) || []; } catch { state.tracked = []; }
  }

  // Chart.js defaults (si Chart está cargado)
  if (window.Chart && window.Chart.defaults && window.Chart.defaults.elements && window.Chart.defaults.elements.candlestick) {
    const upColor = '#0ecb81';
    const downColor = '#f6465d';
    const neutralColor = '#999999';

    // Forzar defaults globales para evitar herencias de estilos viejos
    window.Chart.defaults.elements.candlestick.color = { up: upColor, down: downColor, unchanged: neutralColor };
    window.Chart.defaults.elements.candlestick.borderColor = { up: upColor, down: downColor, unchanged: neutralColor };
    window.Chart.defaults.elements.candlestick.wickColor = { up: upColor, down: downColor, unchanged: neutralColor };
    window.Chart.defaults.elements.candlestick.borderWidth = 1;
  }

  const pairSearch = document.getElementById('pair-search');
  const pairSuggestions = document.getElementById('pair-suggestions');
  const pairDetails = document.getElementById('pair-details');
  const closeDetails = document.getElementById('close-details');
  const intervalSelector = document.querySelector('.interval-selector');

  if (closeDetails) {
    closeDetails.addEventListener('click', () => {
      if (pairDetails) pairDetails.classList.add('hidden');
      try {
        const existing = Chart.getChart(document.getElementById('candlestick-chart'));
        if (existing) existing.destroy();
      } catch (e) {
        if (state.chartInstance) { try { state.chartInstance.destroy(); } catch (err) { } state.chartInstance = null; }
      }
    });
  }

  const btnFetchWallet = document.getElementById('btnFetchWallet');
  if (btnFetchWallet) {
    btnFetchWallet.addEventListener('click', async () => {
      const address = document.getElementById('walletAddress').value.trim();
      const walletDataEl = document.getElementById('walletData');
      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) return alert('Por favor ingresa una dirección válida.');
      if (walletDataEl) walletDataEl.innerHTML = '<div class="wallet-loading">Cargando balances...</div>';
      try {
        await fetchAndRenderWallet(address);
      } catch (err) {
        if (walletDataEl) walletDataEl.innerHTML = `<div>Error: ${err.message}</div>`;
      }
    });
  }

  // interval selector
  if (intervalSelector) {
    const desired = [
      { key: '3d', label: '3D' },
      { key: '1d', label: '1D' },
      { key: '4h', label: '4H' },
      { key: '1h', label: '1H' },
      { key: '15m', label: '15M' },
      { key: '5m', label: '5M' },
      { key: '1m', label: '1M' }
    ];
    intervalSelector.innerHTML = '';
    desired.forEach(d => {
      const btn = document.createElement('button');
      btn.dataset.interval = d.key;
      btn.textContent = d.label;
      if (d.key === state.currentInterval) btn.classList.add('active');
      intervalSelector.appendChild(btn);
    });
    intervalSelector.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') {
        state.currentInterval = e.target.dataset.interval;
        window.currentInterval = state.currentInterval;
        intervalSelector.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        if (state.currentPair) renderCandlestick(state.currentPair, state.currentInterval);
      }
    });
  }

  // Fetch coins list
  fetchCoinsList();

  // Pair suggestions
  if (pairSearch && pairSuggestions) {
    pairSearch.addEventListener('input', () => {
      const q = pairSearch.value.trim().toUpperCase();
      if (!q) { pairSuggestions.classList.remove('active'); return; }
      const matches = (state.coinsList || []).filter(c => c.base.startsWith(q) || c.symbol.startsWith(q)).slice(0, 8);
      if (matches.length === 0) {
        pairSuggestions.innerHTML = '<div>No se encontraron monedas.</div>';
        pairSuggestions.classList.add('active');
        return;
      }
      pairSuggestions.innerHTML = matches.map(c => `<div data-symbol="${c.symbol}">${c.base}/USDT</div>`).join('');
      pairSuggestions.classList.add('active');
    });
    pairSuggestions.addEventListener('click', (e) => {
      if (e.target.dataset.symbol) {
        addTrackedPair(e.target.dataset.symbol);
        pairSuggestions.classList.remove('active');
        pairSearch.value = '';
      }
    });
    document.addEventListener('click', (e) => {
      if (pairSuggestions && !pairSuggestions.contains(e.target) && e.target !== pairSearch) pairSuggestions.classList.remove('active');
    });
  }

  // Render tracked pairs
  renderTrackedPairs();

  // Auto-update prices every 5s
  setInterval(async () => {
    try {
      const priceSpans = document.querySelectorAll('.pair-price');
      for (const span of priceSpans) {
        const symbol = span.getAttribute('data-symbol');
        const price = await fetchPrice(symbol);
        const stats = await fetch24hStats(symbol);

        // solo actualizar texto y clases, NO reemplazar el nodo para no perder listeners o estado
        span.textContent = formatPrice(price);

        if (stats && stats.priceChangePercent !== undefined) {
          const pct = parseFloat(stats.priceChangePercent);
          const change = pct.toFixed(2) + '%';
          const changeClass = pct > 0 ? 'positive' : (pct < 0 ? 'negative' : '');
          const changeIcon = pct > 0 ? '<span class="arrow">▲</span>' : (pct < 0 ? '<span class="arrow">▼</span>' : '');

          const changeSpan = document.querySelector(`.pair-change[data-symbol="${symbol}"]`);
          if (changeSpan) {
            changeSpan.className = `pair-change ${changeClass}`;
            changeSpan.innerHTML = `${changeIcon}${change}`;
          }
        }
      }
    } catch (e) {
      console.error('Auto-update error', e);
    }
  }, 5000);

  // Saved wallets UI
  renderSavedWallets();
  const walletsOnLoad = getSavedWallets();
  if (walletsOnLoad.length) {
    const walletAddress = document.getElementById('walletAddress');
    if (walletAddress) {
      walletAddress.value = walletsOnLoad[walletsOnLoad.length - 1];
      const btnFetchWallet = document.getElementById('btnFetchWallet');
      if (btnFetchWallet) btnFetchWallet.click();
    }
  }

  const btnSaveWallet = document.getElementById('btnSaveWallet');
  if (btnSaveWallet) {
    btnSaveWallet.addEventListener('click', () => {
      const address = document.getElementById('walletAddress').value.trim();
      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) { alert('Dirección no válida'); return; }
      saveWallet(address);
      renderSavedWallets(address);
      document.getElementById('walletAddress').value = address;
      const btnFetchWallet = document.getElementById('btnFetchWallet');
      if (btnFetchWallet) btnFetchWallet.click();
    });
  }

  const savedWallets = document.getElementById('savedWallets');
  if (savedWallets) {
    savedWallets.addEventListener('change', (e) => {
      const address = e.target.value;
      if (address) {
        document.getElementById('walletAddress').value = address;
        const btnFetchWallet = document.getElementById('btnFetchWallet');
        if (btnFetchWallet) btnFetchWallet.click();
      }
    });
  }

  const btnDeleteWallet = document.getElementById('btnDeleteWallet');
  if (btnDeleteWallet) {
    btnDeleteWallet.addEventListener('click', () => {
      const select = document.getElementById('savedWallets');
      const address = select.value;
      if (!address) return;
      let wallets = getSavedWallets();
      wallets = wallets.filter(w => w !== address);
      localStorage.setItem('savedWallets', JSON.stringify(wallets));
      renderSavedWallets();
      document.getElementById('walletAddress').value = '';
      const walletData = document.getElementById('walletData');
      if (walletData) walletData.innerHTML = '';
    });
  }

  const btnCopyWallet = document.getElementById('btnCopyWallet');
  if (btnCopyWallet) {
    btnCopyWallet.addEventListener('click', async () => {
      const select = document.getElementById('savedWallets');
      const address = select.value;
      if (!address) return;
      try {
        await navigator.clipboard.writeText(address);
      } catch {
        alert('No se pudo copiar');
      }
    });
  }

  const btnLoadMore = document.getElementById('btnLoadMore');
  if (btnLoadMore) btnLoadMore.addEventListener('click', loadTx);

  // Exponer globalmente si otras partes del HTML/JS esperan funciones globales
  window.fetchAndShowTransactions = fetchAndShowTransactions;
  window.removeTrackedPair = removeTrackedPair;
});
