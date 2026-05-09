// js/wallet.js
// Saved wallets, multichain balances and wallet dashboard rendering.
import { COINSTATS_API, COINSTATS_API_KEY, SUPPORTED_CHAINS } from './config.js';
import { fetchAndShowTransactions } from './transactions.js';
import { escapeHTML, safeErrorMessage, safeImageUrl } from './utils.js';

const BALANCE_CONCURRENCY = 4;

const TOKEN_ICON_FALLBACKS = {
  USUAL: 'https://etherscan.io/token/images/usualtoken_32.svg',
  USUALX: 'https://etherscan.io/token/images/usualx_32.png',
  USD0: 'https://static.coinstats.app/coins/usual-usdE9O.png',
  BIO: 'https://etherscan.io/token/images/bioxyz_32.png',
  ETH: './images/Eth-icon-purple.png',
  USDC: 'https://etherscan.io/token/images/usdc_ofc_32.svg',
  USDT: 'https://etherscan.io/token/images/tethernew_32.svg',
  SOL: 'https://cryptologos.cc/logos/solana-sol-logo.png'
};

export function getSavedWallets() {
  return JSON.parse(localStorage.getItem('savedWallets') || '[]');
}

export function saveWallet(address) {
  const wallets = getSavedWallets();
  if (!wallets.includes(address)) {
    wallets.push(address);
    localStorage.setItem('savedWallets', JSON.stringify(wallets));
  }
}

export function renderSavedWallets(selectedAddress = null) {
  const select = document.getElementById('savedWallets');
  if (!select) return;

  const wallets = getSavedWallets()
    .filter(w => typeof w === 'string' && /^0x[a-fA-F0-9]{40}$/.test(w));

  localStorage.setItem('savedWallets', JSON.stringify(wallets));
  select.replaceChildren();

  if (!wallets.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '(Sin billeteras guardadas)';
    select.appendChild(option);
    return;
  }

  const fragment = document.createDocumentFragment();
  wallets.forEach(wallet => {
    const option = document.createElement('option');
    option.value = wallet;
    option.textContent = wallet;
    fragment.appendChild(option);
  });

  select.appendChild(fragment);
  select.value = selectedAddress || wallets[wallets.length - 1];
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function tokenIconHtml(symbol, imgUrl) {
  const safeSymbol = escapeHTML(symbol || 'Token');
  const iconUrl = safeImageUrl(imgUrl, TOKEN_ICON_FALLBACKS[String(symbol || '').toUpperCase()] || '');
  if (!iconUrl) return '';
  return `<img src="${escapeHTML(iconUrl)}" alt="${safeSymbol}" id="icon">`;
}

function setWalletMessage(walletDataEl, message, className = '') {
  const el = document.createElement('div');
  if (className) el.className = className;
  el.textContent = message;
  walletDataEl.replaceChildren(el);
}

async function fetchChainBalances(address, chain) {
  const isEvmAddress = address.startsWith('0x');
  if (isEvmAddress && chain.id === 'solana') {
    return { chain, balances: [] };
  }

  try {
    const url = `${COINSTATS_API}/wallet/balance?address=${encodeURIComponent(address)}&connectionId=${encodeURIComponent(chain.id)}`;
    const response = await fetch(url, {
      headers: { 'X-API-KEY': COINSTATS_API_KEY }
    });

    if (!response.ok) {
      console.warn(`Failed to fetch ${chain.name}:`, response.status);
      return { chain, balances: [] };
    }

    const balances = await response.json();
    return { chain, balances: Array.isArray(balances) ? balances : [] };
  } catch (error) {
    console.warn(`Error fetching ${chain.name}:`, error);
    return { chain, balances: [] };
  }
}

export async function fetchAndRenderWallet(address) {
  const walletDataEl = document.getElementById('walletData');
  if (!walletDataEl) return;

  setWalletMessage(walletDataEl, 'Cargando balances de multiples redes...', 'wallet-loading');

  const transactionsPromise = fetchAndShowTransactions(address, 'all')
    .catch(error => console.warn('Error loading transactions:', error));

  try {
    const chainResults = await mapWithConcurrency(
      SUPPORTED_CHAINS,
      BALANCE_CONCURRENCY,
      chain => fetchChainBalances(address, chain)
    );

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
        .filter(asset => asset.total > 0);

      if (chainAssets.length > 0) {
        byChain[chain.name] = chainAssets;
        allAssets = allAssets.concat(chainAssets);
      }
    }

    if (allAssets.length === 0) {
      setWalletMessage(walletDataEl, 'No se encontraron balances con valor en ninguna red');
      await transactionsPromise;
      return;
    }

    const assetsTotal = allAssets.reduce((acc, asset) => acc + (asset.total || 0), 0);
    let html = `<div class="wallet-dashboard">
      <div class="wallet-totals">
        <div class="wallet-total-title">Total Worth</div>
        <div class="wallet-total-usd">$${assetsTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
        <div class="wallet-total-sub">Assets: $${assetsTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} &nbsp; | &nbsp; DeFi: $0</div>
      </div>`;

    const chains = Object.keys(byChain).sort();
    for (const chainName of chains) {
      const list = byChain[chainName];
      const chainTotal = list.reduce((sum, asset) => sum + (asset.total || 0), 0);
      const chainIcon = escapeHTML(list[0]?.chainIcon || '');
      const safeChainName = escapeHTML(chainName);

      html += `<div class="wallet-assets-card">
        <div class="wallet-assets-card-head">
          <div class="wallet-section-title">${chainIcon} ${safeChainName}</div>
          <div class="wallet-chain-total">Total ${safeChainName}: $${chainTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
        </div>
        <table class="wallet-assets-table">
          <thead><tr><th>Name</th><th>Amount</th><th>Price</th><th>Total</th></tr></thead>
          <tbody>`;

      html += list.map(asset => {
        const symbol = String(asset.symbol || 'TOKEN');
        const safeSymbol = escapeHTML(symbol);
        const special4 = ['USUAL', 'USUALX', 'USD0', 'BIO'];
        const priceStr = asset.price === null || asset.price === undefined
          ? '-'
          : special4.includes(symbol.toUpperCase())
            ? `$${Number(asset.price).toFixed(4)}`
            : `$${Number(asset.price).toFixed(2)}`;
        const amountStr = asset.amount === null || asset.amount === undefined
          ? '-'
          : (symbol === 'ETH' || symbol === 'SOL')
            ? Number(asset.amount).toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 })
            : Number(asset.amount).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
        const totalStr = asset.total ? `$${asset.total.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '-';

        return `<tr>
          <td>${tokenIconHtml(symbol, asset.imgUrl)}${safeSymbol}</td>
          <td>${amountStr}</td>
          <td>${priceStr}</td>
          <td>${totalStr}</td>
        </tr>`;
      }).join('');

      html += '</tbody></table></div>';
    }

    html += '</div>';
    walletDataEl.innerHTML = html;

    await transactionsPromise;
  } catch (err) {
    console.warn('fetchAndRenderWallet error:', safeErrorMessage(err));
    setWalletMessage(walletDataEl, `Error: ${safeErrorMessage(err)}`);
  }
}
