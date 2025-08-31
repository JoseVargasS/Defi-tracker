// js/wallet.js
//Funciones para saved wallets y render wallet.
import { ETH_API, ETH_KEY } from './config.js';
import { makeRequest } from './utils.js';
import { getTokenPriceUSD } from './prices.js';

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

export async function fetchAndRenderWallet(address) {
  const walletDataEl = document.getElementById('walletData');
  if (!walletDataEl) return;
  walletDataEl.innerHTML = '<div class="wallet-loading">Cargando balances...</div>';
  try {
    const res = await makeRequest(`${ETH_API}?module=account&action=balance&address=${address}&tag=latest&apikey=${ETH_KEY}`);
    if (!res || res.status !== '1') return walletDataEl.innerHTML = `<div>No se pudo obtener balance ETH: ${res?.message || 'error'}</div>`;

    let ethBal = parseInt(res.result) / 1e18;
    if (isNaN(ethBal)) ethBal = 0;

    const txRes = await makeRequest(`${ETH_API}?module=account&action=tokentx&address=${address}&sort=desc&apikey=${ETH_KEY}`);
    const tokens = {};
    if (txRes.result && Array.isArray(txRes.result)) {
      txRes.result.forEach(t => {
        if (!t || !t.contractAddress) return;
        tokens[t.contractAddress.toLowerCase()] = { symbol: t.tokenSymbol, decimals: t.tokenDecimal, contract: t.contractAddress.toLowerCase() };
      });
    }
    const addrs = Object.keys(tokens).slice(0, 20);

    const ethPrice = await getTokenPriceUSD('ETH');
    const ethTotal = ethPrice ? ethBal * ethPrice : 0;
    const assets = [{ name: 'ETH', symbol: 'ETH', amount: ethBal, price: ethPrice, total: ethTotal, chain: 'Ethereum' }];

    for (const c of addrs) {
      const token = tokens[c];
      try {
        const bRes = await makeRequest(`${ETH_API}?module=account&action=tokenbalance&contractaddress=${c}&address=${address}&tag=latest&apikey=${ETH_KEY}`);
        let val = parseInt(bRes.result) / (10 ** (token.decimals || 18));
        if (isNaN(val)) val = 0;
        let price = await getTokenPriceUSD(token.symbol);
        let chainName = null;

        if (!chainName) chainName = 'Ethereum';
        const total = price ? (val * price) : 0;
        assets.push({ name: token.symbol, symbol: token.symbol, amount: val, price: price, total: total, chain: chainName });
      } catch (e) {
        console.warn('token balance error', c, e);
      }
    }

    const nonZeroAssets = assets.filter(a => a.total && a.total > 0);
    const byChain = {};
    for (const a of nonZeroAssets) {
      const chain = a.chain || 'Ethereum';
      if (!byChain[chain]) byChain[chain] = [];
      byChain[chain].push(a);
    }
    const assetsTotal = nonZeroAssets.reduce((acc, a) => acc + (a.total || 0), 0);

    // render HTML
    let html = `<div class="wallet-dashboard">
      <div class="wallet-totals">
        <div class="wallet-total-title">Total Worth</div>
        <div class="wallet-total-usd">$${assetsTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
        <div class="wallet-total-sub">Assets: $${assetsTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} &nbsp; | &nbsp; DeFi: $0</div>
      </div>`;

    const chains = Object.keys(byChain).sort();
    for (const chain of chains) {
      const list = byChain[chain];
      const chainTotal = list.reduce((s, x) => s + (x.total || 0), 0);
      html += `<div class="wallet-assets-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <div class="wallet-section-title">${chain}</div>
          <div style="font-weight:700;">Total ${chain}: $${chainTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
        </div>
        <table class="wallet-assets-table">
          <thead><tr><th>Name</th><th>Amount</th><th>Price</th><th>Total</th></thead>
          <tbody>`;

      html += list.map(a => {
        let icon = '';
        // íconos especiales (puedes extender)
        if (a.symbol === 'USUAL') icon = '<img src="https://etherscan.io/token/images/usualtoken_32.svg" alt="USUAL" id="icon">';
        else if (a.symbol === 'USUALX') icon = '<img src="https://etherscan.io/token/images/usualx_32.png" alt="USUALX" id="icon">';
        else if (a.symbol === 'USD0') icon = '<img src="https://static.coinstats.app/coins/usual-usdE9O.png" alt="USD0" id="icon">';
        else if (a.symbol === 'BIO') icon = '<img src="https://etherscan.io/token/images/bioxyz_32.png" alt="BIO" id="icon">';
        else if (a.symbol === 'ETH') icon = '<img src="./images/Eth-icon-purple.png" alt="ETH" id="icon">';
        else if (a.symbol === 'USDC') icon = '<img src="https://etherscan.io/token/images/usdc_ofc_32.svg" alt="USDC" id="icon">';
        else if (a.symbol === 'USDT') icon = '<img src="https://etherscan.io/token/images/tethernew_32.svg" alt="USDT" id="icon">';

        const special4 = ['USUAL', 'USUALX', 'USD0', 'BIO'];
        const priceStr = (a.price === null || a.price === undefined) ? '-' : (special4.includes((a.symbol || '').toUpperCase()) ? ('$' + Number(a.price).toFixed(4)) : ('$' + Number(a.price).toFixed(2)));
        const amountStr = (a.amount === null || a.amount === undefined) ? '-' : ((a.symbol === 'ETH') ? Number(a.amount).toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 }) : Number(a.amount).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 }));
        const totalStr = a.total ? ('$' + a.total.toLocaleString(undefined, { maximumFractionDigits: 2 })) : '-';

        return `<tr><td>${icon}${a.symbol}</td><td>${amountStr}</td><td>${priceStr}</td><td>${totalStr}</td></tr>`;
      }).join('');

      html += `</tbody></table></div>`;
    }
    html += `</div>`;
    walletDataEl.innerHTML = html;

    // Si existe fetchAndShowTransactions lo llamamos
    try { if (window.fetchAndShowTransactions) window.fetchAndShowTransactions(address); } catch (e) { }
  } catch (err) {
    console.error('fetchAndRenderWallet error', err);
    const walletDataEl = document.getElementById('walletData');
    if (walletDataEl) walletDataEl.innerHTML = `<div>Error: ${err.message}</div>`;
  }
}
