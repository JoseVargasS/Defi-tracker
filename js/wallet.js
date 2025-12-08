// js/wallet.js
//Funciones para saved wallets y render wallet.
import { COINSTATS_API, COINSTATS_API_KEY, SUPPORTED_CHAINS } from './config.js';
import { makeRequest } from './utils.js';
import { fetchAndShowTransactions } from './transactions.js';

export function getSavedWallets() { return JSON.parse(localStorage.getItem('savedWallets') || '[]'); }
export function saveWallet(address) {
  let wallets = getSavedWallets();
  if (!wallets.includes(address)) { wallets.push(address); localStorage.setItem('savedWallets', JSON.stringify(wallets)); }
}
export function renderSavedWallets(selectedAddress = null) {
  const select = document.getElementById('savedWallets');
  if (!select) return;
  let wallets = getSavedWallets();
  wallets = wallets.filter(w => typeof w === 'string' && /^0x[a-fA-F0-9]{40}$/.test(w));
  localStorage.setItem('savedWallets', JSON.stringify(wallets));
  select.innerHTML = wallets.length ? wallets.map(w => `<option value="${w}">${w}</option>`).join('') : '<option value="">(Sin billeteras guardadas)</option>';
  if (wallets.length) select.value = selectedAddress || wallets[wallets.length - 1];
}

// Helper function to add delay between API calls
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchAndRenderWallet(address) {
  const walletDataEl = document.getElementById('walletData');
  if (!walletDataEl) return;
  walletDataEl.innerHTML = '<div class="wallet-loading">Cargando balances de múltiples redes...</div>';

  try {
    // Fetch balances from all supported chains SEQUENTIALLY with delays to avoid rate limits
    const chainResults = [];

    for (let i = 0; i < SUPPORTED_CHAINS.length; i++) {
      const chain = SUPPORTED_CHAINS[i];

      try {
        const url = `${COINSTATS_API}/wallet/balance?address=${address}&connectionId=${chain.id}`;
        const response = await fetch(url, {
          headers: {
            'X-API-KEY': COINSTATS_API_KEY
          }
        });

        if (!response.ok) {
          console.warn(`Failed to fetch ${chain.name}:`, response.status);
          chainResults.push({ chain, balances: [] });
        } else {
          const balances = await response.json();
          chainResults.push({ chain, balances: Array.isArray(balances) ? balances : [] });
        }
      } catch (error) {
        console.warn(`Error fetching ${chain.name}:`, error);
        chainResults.push({ chain, balances: [] });
      }

      // Add 600ms delay between requests to avoid rate limiting (except for last request)
      if (i < SUPPORTED_CHAINS.length - 1) {
        await delay(600);
      }
    }

    // Process and aggregate all balances
    let allAssets = [];
    const byChain = {};

    for (const { chain, balances } of chainResults) {
      if (!balances || balances.length === 0) continue;

      const chainAssets = balances
        .map(token => ({
          name: token.name || token.symbol,
          symbol: token.symbol,
          amount: token.amount || 0,
          price: token.price || 0,
          total: (token.amount || 0) * (token.price || 0),
          chain: chain.name,
          chainId: chain.id,
          chainIcon: chain.icon,
          imgUrl: token.imgUrl
        }))
        .filter(a => a.total > 0);

      if (chainAssets.length > 0) {
        byChain[chain.name] = chainAssets;
        allAssets = allAssets.concat(chainAssets);
      }
    }

    if (allAssets.length === 0) {
      walletDataEl.innerHTML = '<div>No se encontraron balances con valor en ninguna red</div>';
      return;
    }

    const assetsTotal = allAssets.reduce((acc, a) => acc + (a.total || 0), 0);

    // Render HTML
    let html = `<div class="wallet-dashboard">
      <div class="wallet-totals">
        <div class="wallet-total-title">Total Worth</div>
        <div class="wallet-total-usd">$${assetsTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
        <div class="wallet-total-sub">Assets: $${assetsTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} &nbsp; | &nbsp; DeFi: $0</div>
      </div>`;

    const chains = Object.keys(byChain).sort();
    for (const chainName of chains) {
      const list = byChain[chainName];
      const chainTotal = list.reduce((s, x) => s + (x.total || 0), 0);
      const chainIcon = list[0]?.chainIcon || '';

      html += `<div class="wallet-assets-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <div class="wallet-section-title">${chainIcon} ${chainName}</div>
          <div style="font-weight:700;">Total ${chainName}: $${chainTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
        </div>
        <table class="wallet-assets-table">
          <thead><tr><th>Name</th><th>Amount</th><th>Price</th><th>Total</th></thead>
          <tbody>`;

      html += list.map(a => {
        let icon = '';

        // Use CoinStats provided image if available
        if (a.imgUrl) {
          icon = `<img src="${a.imgUrl}" alt="${a.symbol}" id="icon" onerror="this.style.display='none'">`;
        } else {
          // Fallback to hardcoded icons
          if (a.symbol === 'USUAL') icon = '<img src="https://etherscan.io/token/images/usualtoken_32.svg" alt="USUAL" id="icon">';
          else if (a.symbol === 'USUALX') icon = '<img src="https://etherscan.io/token/images/usualx_32.png" alt="USUALX" id="icon">';
          else if (a.symbol === 'USD0') icon = '<img src="https://static.coinstats.app/coins/usual-usdE9O.png" alt="USD0" id="icon">';
          else if (a.symbol === 'BIO') icon = '<img src="https://etherscan.io/token/images/bioxyz_32.png" alt="BIO" id="icon">';
          else if (a.symbol === 'ETH') icon = '<img src="./images/Eth-icon-purple.png" alt="ETH" id="icon">';
          else if (a.symbol === 'USDC') icon = '<img src="https://etherscan.io/token/images/usdc_ofc_32.svg" alt="USDC" id="icon">';
          else if (a.symbol === 'USDT') icon = '<img src="https://etherscan.io/token/images/tethernew_32.svg" alt="USDT" id="icon">';
          else if (a.symbol === 'SOL') icon = '<img src="https://cryptologos.cc/logos/solana-sol-logo.png" alt="SOL" id="icon">';
        }

        const special4 = ['USUAL', 'USUALX', 'USD0', 'BIO'];
        const priceStr = (a.price === null || a.price === undefined) ? '-' : (special4.includes((a.symbol || '').toUpperCase()) ? ('$' + Number(a.price).toFixed(4)) : ('$' + Number(a.price).toFixed(2)));
        const amountStr = (a.amount === null || a.amount === undefined) ? '-' : ((a.symbol === 'ETH' || a.symbol === 'SOL') ? Number(a.amount).toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 }) : Number(a.amount).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 }));
        const totalStr = a.total ? ('$' + a.total.toLocaleString(undefined, { maximumFractionDigits: 2 })) : '-';

        return `<tr><td>${icon}${a.symbol}</td><td>${amountStr}</td><td>${priceStr}</td><td>${totalStr}</td></tr>`;
      }).join('');

      html += `</tbody></table></div>`;
    }
    html += `</div>`;
    walletDataEl.innerHTML = html;

    // Llamar transacciones después de un delay
    try {
      await delay(4000); // Wait 4 seconds before fetching transactions
      await fetchAndShowTransactions(address);
    } catch (e) { console.warn('Error loading transactions:', e); }
  } catch (err) {
    console.error('fetchAndRenderWallet error', err);
    const walletDataEl = document.getElementById('walletData');
    if (walletDataEl) walletDataEl.innerHTML = `<div>Error: ${err.message}</div>`;
  }
}
