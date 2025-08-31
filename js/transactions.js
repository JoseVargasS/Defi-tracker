// js/transactions.js
//Carga y render de transacciones.
import { ETH_API, ETH_KEY } from './config.js';
import { makeRequest } from './utils.js';
import { getTokenPriceUSD, getHistoricalTokenPriceUSD } from './prices.js';
import { monthNames } from './state.js'

let txList = [], offset = 0;
let currentTxAddress = null;

export async function loadTx() {
  const tbody = document.getElementById('txBody');
  if (!tbody) return;
  const slice = txList.slice(offset, offset + 10);
  const grouped = {};
  for (const tx of slice) {
    if (!tx || !tx.timeStamp) continue;
    const date = new Date(tx.timeStamp * 1000).toLocaleDateString('es-ES');
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(tx);
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
      const addr = currentTxAddress ? currentTxAddress.toLowerCase() : '';
      const isSent = tx.from && tx.from.toLowerCase() === addr;
      const type = isSent ? 'Sent' : 'Received';
      const sym = tx.tokenSymbol || 'ETH';
      const dec = tx.tokenDecimal || 18;
      const amt = parseInt(tx.value) / 10 ** dec;
      let icon = '';
      if (sym === 'USUAL') icon = '<img src="https://etherscan.io/token/images/usualtoken_32.svg" alt="USUAL" id="icon">';
      else if (sym === 'USUALX') icon = '<img src="https://etherscan.io/token/images/usualx_32.png" alt="USUALX" id="icon">';
      else if (sym === 'USD0') icon = '<img src="https://static.coinstats.app/coins/usual-usdE9O.png" alt="USD0" id="icon">';
      else if (sym === 'BIO') icon = '<img src="https://etherscan.io/token/images/bioxyz_32.png" alt="BIO" id="icon">';
      else if (sym === 'ETH') icon = '<img src="./images/Eth-icon-purple.png" alt="ETH" id="icon">';
      else if (sym === 'USDC') icon = '<img src="https://etherscan.io/token/images/usdc_ofc_32.svg" alt="USDC" id="icon">';
      else if (sym === 'USDT') icon = '<img src="https://etherscan.io/token/images/tethernew_32.svg" alt="USDT" id="icon">';

      const amtFormatted = sym === 'ETH' ? Number(amt).toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 }) : Number(amt).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });

      let amountText = isSent ? `<span class='tx-amount sent'>- ${amtFormatted}</span>` : `<span class='tx-amount'>+ ${amtFormatted}</span>`;
      let priceUSD = 0;
      if (sym === 'ETH') priceUSD = await getTokenPriceUSD('ETH');
      else priceUSD = await getTokenPriceUSD(sym);
      let usd = amt * (priceUSD || 0);
      const txDateObj = new Date(tx.timeStamp * 1000);
      let priceHist = await getHistoricalTokenPriceUSD(sym, txDateObj);
      let noData = false;
      if (!priceHist || priceHist === 0) { noData = true; priceHist = null; }
      let usdHist = amt * (priceHist || 0);
      let pl = usd - usdHist;
      let plPct = usdHist ? (pl / usdHist) * 100 : 0;
      let plColor = pl > 0 ? '#1ecb81' : (pl < 0 ? '#e74c3c' : '#aaa');
      let amountDetail = noData ? `<div class='tx-detail' style='color:#e74c3c;'>Sin datos históricos</div>` : `<div class='tx-detail'>$${usdHist.toLocaleString(undefined, { maximumFractionDigits: 2 })} (1 ${sym} = $${priceHist ? priceHist.toFixed(4) : '-'})</div>`;
      const row = document.createElement('tr');
      row.className = 'tx-list-row';
      row.innerHTML = `
        <td class='tx-type${isSent ? ' sent' : ''}'>${type}</td>
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
  offset += 10;
  const txTableEl = document.getElementById('txTable');
  if (txTableEl) txTableEl.style.display = 'table';
  const btnMore = document.getElementById('btnLoadMore');
  if (btnMore) {
    if (offset < txList.length) btnMore.parentElement.style.display = 'block';
    else btnMore.parentElement.style.display = 'none';
  }
}

export async function fetchAndShowTransactions(address) {
  offset = 0; txList = []; currentTxAddress = address;
  const tbody = document.getElementById('txBody');
  if (tbody) tbody.innerHTML = '';
  if (!address) return;
  try {
    const res = await makeRequest(`${ETH_API}?module=account&action=tokentx&address=${address}&sort=desc&apikey=${ETH_KEY}`);
    const data = res;
    txList = data.result || [];
    loadTx();
  } catch (error) {
    console.error('Error fetching transactions:', error);
  }
}

// export for other modules
export { txList as _txListRef };
