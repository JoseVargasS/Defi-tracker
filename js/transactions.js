// js/transactions.js
// Carga y render de transacciones (ERC-20 + ETH nativo para ETH, Coinstats para Base)

import { ETH_API, ETH_KEY, COINSTATS_API, COINSTATS_API_KEY } from './config.js';
import { makeRequest } from './utils.js';
import { getTokenPriceUSD, getHistoricalTokenPriceUSD } from './prices.js';
import { monthNames } from './state.js'

// Per-network state
const networks = {
  'ethereum': { txList: [], offset: 0, tbodyId: 'eth-txBody', tableId: 'eth-txTable', btnId: 'btnLoadMoreEth' },
  'base-wallet': { txList: [], offset: 0, tbodyId: 'base-txBody', tableId: 'base-txTable', btnId: 'btnLoadMoreBase' }
};

let currentTxAddress = null;

/* ------------------ Helpers de cantidad/formatos ------------------ */
function safeIsIntegerString(s) {
  return typeof s === 'string' && /^\d+$/.test(s);
}

function formatDisplayAmount(valueStr, decimals = 18, displayDecimals = 4) {
  try {
    const vStr = String(valueStr || '0');
    const dec = Number.isFinite(Number(decimals)) ? Number(decimals) : 18;
    const disp = Number.isFinite(Number(displayDecimals)) ? Number(displayDecimals) : 4;

    if (vStr.includes('.')) {
      const n = Number(vStr);
      return n.toLocaleString(undefined, { minimumFractionDigits: disp, maximumFractionDigits: disp });
    }

    if (!safeIsIntegerString(vStr)) {
      const n = Number(vStr) || 0;
      return n.toLocaleString(undefined, { minimumFractionDigits: disp, maximumFractionDigits: disp });
    }

    if (vStr.length <= 15) {
      const n = Number(vStr) / Math.pow(10, dec);
      return n.toLocaleString(undefined, { minimumFractionDigits: disp, maximumFractionDigits: disp });
    }

    if (typeof BigInt !== 'undefined') {
      const big = BigInt(vStr);
      const base = BigInt(10) ** BigInt(dec);
      const intPart = big / base;
      let fracPart = big % base;

      const needed = disp + 1;
      let fracFull = fracPart.toString().padStart(dec, '0').slice(0, Math.max(needed, 0));
      if (fracFull.length < needed) fracFull = fracFull.padEnd(needed, '0');

      let fracToRound = fracFull.slice(0, disp);
      const roundDigit = Number(fracFull.charAt(disp) || '0');

      if (roundDigit >= 5) {
        let carry = BigInt(1);
        let fracNum = BigInt(fracToRound || '0') + carry;
        const maxFrac = BigInt(10) ** BigInt(disp);
        if (fracNum >= maxFrac) {
          const newInt = (intPart + BigInt(1)).toString();
          return `${newInt}.${'0'.repeat(disp)}`;
        } else {
          let fracStr = fracNum.toString().padStart(disp, '0');
          return `${intPart.toString()}.${fracStr}`;
        }
      } else {
        fracToRound = fracToRound.padEnd(disp, '0');
        return `${intPart.toString()}.${fracToRound}`;
      }
    }

    const fallback = Number(vStr) / Math.pow(10, dec);
    return fallback.toLocaleString(undefined, { minimumFractionDigits: disp, maximumFractionDigits: disp });
  } catch (e) {
    return String(valueStr || '0');
  }
}

function amountToFloat(valueStr, decimals = 18) {
  try {
    const vStr = String(valueStr || '0');
    if (vStr.includes('.')) return Number(vStr);
    if (vStr.length <= 15) {
      return Number(vStr) / Math.pow(10, Number(decimals));
    }
    if (typeof BigInt !== 'undefined') {
      const dec = Number(decimals || 18);
      const big = BigInt(vStr);
      const base = BigInt(10) ** BigInt(dec);
      const intPart = big / base;
      let fracPart = big % base;
      const showDecimals = 8;
      let fracStr = fracPart.toString().padStart(dec, '0').slice(0, showDecimals).padEnd(showDecimals, '0');
      const combined = `${intPart.toString()}.${fracStr}`;
      return parseFloat(combined);
    }
    return Number(vStr) / Math.pow(10, Number(decimals));
  } catch (e) {
    return 0;
  }
}

/* ------------------ Render / carga ------------------ */

export async function loadTx(networkId = 'ethereum') {
  const net = networks[networkId];
  const tbody = document.getElementById(net.tbodyId);
  if (!tbody) return;

  const slice = net.txList.slice(net.offset, net.offset + 10);
  const grouped = {};

  for (const tx of slice) {
    if (!tx || !tx.timeStamp) continue;
    const tsNum = Number(tx.timeStamp);
    if (!tsNum) continue;

    const date = new Date(tsNum * 1000).toLocaleDateString('es-ES');
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(tx);
  }

  const pricesData = [];
  for (let i = 0; i < slice.length; i++) {
    const tx = slice[i];
    const sym = tx.tokenSymbol || tx.symbol || 'ETH';
    const txDateObj = new Date(Number(tx.timeStamp) * 1000);

    try {
      // Use sequential fetching with a small delay to avoid 429 errors
      const current = await getTokenPriceUSD(sym === 'ETH' ? 'ETH' : sym);
      const historical = await getHistoricalTokenPriceUSD(sym === 'ETH' ? 'ETH' : sym, txDateObj);
      
      pricesData.push({ status: 'fulfilled', value: { current, historical } });
    } catch (e) {
      pricesData.push({ status: 'rejected', reason: e });
    }
    
    // Small delay between transactions to avoid burst rate limits
    if (i < slice.length - 1) {
      await new Promise(r => setTimeout(r, 150));
    }
  }



  for (const date of Object.keys(grouped)) {
    const [day, month, year] = date.split('/');
    const dateObj = new Date(`${year}-${month}-${day}`);
    const dateStr = `${parseInt(day)} ${monthNames[dateObj.getMonth()]}${year ? ', ' + year : ''}`;
    const dateDiv = document.createElement('tr');

    dateDiv.className = 'tx-date-row';
    dateDiv.innerHTML = `<td colspan='8'>${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)}</td>`;
    tbody.appendChild(dateDiv);

    const tagsRow = document.createElement('tr');
    tagsRow.className = 'tx-list-tags';
    tagsRow.innerHTML = `<td>tipo</td><td>token</td><td>cantidad</td><td>USD / P&L</td>`;
    tbody.appendChild(tagsRow);

    for (const tx of grouped[date]) {
      const txIndex = slice.findIndex(t => t === tx);
      const pResult = pricesData[txIndex];
      const { current: priceUSD, historical: priceHistRaw } = (pResult && pResult.status === 'fulfilled') ? pResult.value : { current: 0, historical: null };
      let priceHist = priceHistRaw;

      const addr = currentTxAddress ? currentTxAddress.toLowerCase() : '';
      const isSent = tx.from && tx.from.toLowerCase() === addr;
      const type = isSent ? 'Sent' : 'Received';

      const sym = tx.tokenSymbol || tx.symbol || 'ETH';
      const dec = (tx.tokenDecimal !== undefined && tx.tokenDecimal !== null) ? Number(tx.tokenDecimal) : ((tx.decimals !== undefined && tx.decimals !== null) ? Number(tx.decimals) : 18);
      const rawValue = tx.value ?? tx.tokenValue ?? tx.amount ?? '0';

      const displayDecimals = (sym === 'ETH' || sym === 'BASE') ? 6 : 4;
      const amtFormatted = formatDisplayAmount(String(rawValue || '0'), dec, displayDecimals);
      const amtFloat = amountToFloat(String(rawValue || '0'), dec);

      if (sym === 'ETH' && amtFloat < 0.00001) continue;

      let icon = '';
      if (tx.imgUrl) {
          icon = `<img src="${tx.imgUrl}" alt="${sym}" class="tx-icon" onerror="this.style.display='none'">`;
      } else {
          if (sym === 'USUAL') icon = '<img src="https://etherscan.io/token/images/usualtoken_32.svg" alt="USUAL" class="tx-icon">';
          else if (sym === 'USUALX') icon = '<img src="https://etherscan.io/token/images/usualx_32.png" alt="USUALX" class="tx-icon">';
          else if (sym === 'USD0') icon = '<img src="https://static.coinstats.app/coins/usual-usdE9O.png" alt="USD0" class="tx-icon">';
          else if (sym === 'BIO') icon = '<img src="https://etherscan.io/token/images/bioxyz_32.png" alt="BIO" class="tx-icon">';
          else if (sym === 'ETH') icon = '<img src="./images/Eth-icon-purple.png" alt="ETH" class="tx-icon">';
          else if (sym === 'USDC') icon = '<img src="https://etherscan.io/token/images/usdc_ofc_32.svg" alt="USDC" class="tx-icon">';
          else if (sym === 'USDT') icon = '<img src="https://etherscan.io/token/images/tethernew_32.svg" alt="USDT" class="tx-icon">';
      }

      let amountText = isSent ? `<span class='tx-amount sent'>- ${amtFormatted}</span>` : `<span class='tx-amount'>+ ${amtFormatted}</span>`;
      let usd = amtFloat * (priceUSD || 0);
      let noData = false;
      if (!priceHist || priceHist === 0) { noData = true; priceHist = null; }

      let usdHist = amtFloat * (priceHist || 0);
      let pl = usd - usdHist;
      let plPct = usdHist ? (pl / usdHist) * 100 : 0;
      let plColor = pl > 0 ? '#1ecb81' : (pl < 0 ? '#e74c3c' : '#aaa');
      
      let amountDetail = noData ? `<div class='tx-detail' style='color:#888;'>Sin datos históricos</div>` : `<div class='tx-detail'>$${usdHist.toLocaleString(undefined, { maximumFractionDigits: 2 })} (1 ${sym} = $${priceHist ? priceHist.toFixed(4) : '-'})</div>`;
      
      const txDateObj = new Date(Number(tx.timeStamp) * 1000);
      const timeStr = txDateObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

      const row = document.createElement('tr');
      row.className = 'tx-list-row';
      row.innerHTML = `
        <td class='tx-type${isSent ? ' sent' : ''}'>
          <div>${type}</div>
          <div class='tx-time'>${timeStr}</div>
        </td>
        <td class='tx-token'>${icon}${sym}</td>

        <td>${amountText}${amountDetail}</td>
        <td class='tx-usd'>
          <div>$${usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
          <div style="font-size:0.95em; color:${plColor}; font-weight:600; line-height:1.2;">${pl >= 0 ? '+' : ''}${pl.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
          <div style="font-size:0.85em; color:${plColor}; line-height:1.1;">(${plPct >= 0 ? '+' : ''}${plPct.toFixed(2)}%)</div>
        </td>
      `;
      tbody.appendChild(row);
    }
  }

  net.offset += 10;
  const txTableEl = document.getElementById(net.tableId);
  if (txTableEl) txTableEl.style.display = 'table';

  const btnMore = document.getElementById(net.btnId);
  if (btnMore) {
    if (net.offset < net.txList.length) btnMore.parentElement.style.display = 'block';
    else btnMore.parentElement.style.display = 'none';
  }
}

/* ------------------ Fetch y merge (ERC20 + native) ------------------ */

export async function fetchAndShowTransactions(address, networkId = 'ethereum') {
  if (networkId === 'all') {
      await Promise.all([
          fetchAndShowTransactions(address, 'ethereum'),
          fetchAndShowTransactions(address, 'base-wallet')
      ]);
      return;
  }

  const net = networks[networkId];
  net.offset = 0; net.txList = []; currentTxAddress = address;
  const tbody = document.getElementById(net.tbodyId);
  if (tbody) tbody.innerHTML = '';
  if (!address) return;

  try {
    if (networkId === 'ethereum') {
      const page = 1;
      const offset = 1000;
      const tokentxUrl = `${ETH_API}?chainid=1&module=account&action=tokentx&address=${address}&sort=desc&page=${page}&offset=${offset}&apikey=${ETH_KEY}`;
      const txlistUrl = `${ETH_API}?chainid=1&module=account&action=txlist&address=${address}&sort=desc&page=${page}&offset=${offset}&apikey=${ETH_KEY}`;

      const [r1, r2] = await Promise.allSettled([makeRequest(tokentxUrl), makeRequest(txlistUrl)]);
      let tokenTxs = (r1.status === 'fulfilled' && r1.value && Array.isArray(r1.value.result)) ? r1.value.result : [];
      let normalTxs = (r2.status === 'fulfilled' && r2.value && Array.isArray(r2.value.result)) ? r2.value.result : [];

      const nativeAsTokenStyle = normalTxs
        .filter(t => t && t.timeStamp)
        .map(t => Object.assign({}, t, {
            tokenSymbol: 'ETH',
            tokenDecimal: 18,
            value: t.value ?? '0',
        }));

      const combined = [...tokenTxs, ...nativeAsTokenStyle];
      const seen = new Set();
      const dedup = [];
      for (const tx of combined) {
        const key = `${tx.hash || tx.transactionHash || tx.txHash}-${(tx.tokenSymbol || '')}-${String(tx.value || '')}`;
        if (!seen.has(key)) {
          seen.add(key);
          const normalized = Object.assign({}, tx);
          normalized.hash = normalized.hash || normalized.transactionHash || normalized.txHash || normalized.hash;
          normalized.timeStamp = normalized.timeStamp || normalized.timestamp || normalized.time || normalized.blockNumber || normalized.timeStamp;
          dedup.push(normalized);
        }
      }
      dedup.sort((a, b) => (Number(b.timeStamp) || 0) - (Number(a.timeStamp) || 0));
      net.txList = dedup;
    } 
    else if (networkId === 'base-wallet') {
      console.log('Fetching Base transactions for:', address);
      
      // First, trigger sync to get latest transactions
      const patchUrl = `${COINSTATS_API}/wallet/transactions?address=${address}&connectionId=base-wallet`;
      console.log('Triggering Base transactions sync...');
      const patchRes = await fetch(patchUrl, {
          method: 'PATCH',
          headers: { 'X-API-KEY': COINSTATS_API_KEY }
      });
      console.log('PATCH response:', patchRes.status);
      
      // Wait for sync to complete
      await new Promise(r => setTimeout(r, 5000));
      
      // Now fetch the transactions
      const url = `${COINSTATS_API}/wallet/transactions?address=${address}&connectionId=base-wallet&limit=100`;
      let response = await fetch(url, {
          headers: { 'X-API-KEY': COINSTATS_API_KEY }
      });
      
      console.log('Base transactions response status:', response.status);
      
      if (response.ok) {
          const data = await response.json();
          console.log('Base transactions data received:', data);
          
          const rawResult = data.result || [];
          const flattenedTxList = [];

          for (const res of rawResult) {
              const hash = res.hash ? res.hash.id : (res.id || '0x');
              const timeStamp = res.date ? Math.floor(new Date(res.date).getTime() / 1000) : 0;
              
              if (res.transactions && res.transactions.length) {
                  for (const innerTx of res.transactions) {
                      if (innerTx.items && innerTx.items.length) {
                          for (const item of innerTx.items) {
                              flattenedTxList.push({
                                  hash: hash,
                                  timeStamp: timeStamp,
                                  from: item.fromAddress || '',
                                  to: item.toAddress || '',
                                  tokenSymbol: item.coin ? item.coin.symbol : '?',
                                  tokenDecimal: 0, // CoinStats 'count' is already float
                                  value: item.count || 0,
                                  imgUrl: (item.coin && item.coin.icon) || (res.mainContent && res.mainContent.coinIcons && res.mainContent.coinIcons[0]) || null
                              });
                          }
                      }
                  }
              } else {
                  // Fallback if no transactions/items but coinData exists
                  flattenedTxList.push({
                      hash: hash,
                      timeStamp: timeStamp,
                      from: '', to: '',
                      tokenSymbol: res.coinData ? res.coinData.symbol : '?',
                      tokenDecimal: 0,
                      value: res.coinData ? res.coinData.count : 0,
                      imgUrl: (res.mainContent && res.mainContent.coinIcons && res.mainContent.coinIcons[0]) || null
                  });
              }
          }

          flattenedTxList.sort((a, b) => (Number(b.timeStamp) || 0) - (Number(a.timeStamp) || 0));
          net.txList = flattenedTxList;
          console.log('Processed Base transactions count:', net.txList.length);
      } else {
        const errText = await response.text();
        console.warn('Base transactions fetch failed:', response.status, errText);
        if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 20px; color: #888;">${response.status === 409 ? 'La red se está sincronizando... Refresca en unos segundos.' : 'No se pudieron cargar las transacciones de Base.'}</td></tr>`;
      }
    }

    loadTx(networkId);
  } catch (error) {
    console.error(`Error fetching ${networkId} transactions:`, error);
  }
}

// export para uso externo si necesario
export { networks as _networksRef };
