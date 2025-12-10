// js/transactions.js
// Carga y render de transacciones (ERC-20 + ETH nativo)
// Ahora: hace 2 llamadas (tokentx y txlist), une y muestra ambas.

import { ETH_API, ETH_KEY } from './config.js';
import { makeRequest } from './utils.js';
import { getTokenPriceUSD, getHistoricalTokenPriceUSD } from './prices.js';
import { monthNames } from './state.js'

let txList = [], offset = 0;
let currentTxAddress = null;

/* ------------------ Helpers de cantidad/formatos ------------------ */
function safeIsIntegerString(s) {
  return typeof s === 'string' && /^\d+$/.test(s);
}

/**
 * formatDisplayAmount
 * Devuelve una string formateada para mostrar: usa BigInt cuando el valor es grande.
 * valueStr: string entero en la unidad mínima (wei / token smallest unit)
 * decimals: número de decimales del token (p. ej. 18)
 * displayDecimals: cuántos decimales mostrar en la UI (ej. ETH -> 6, tokens -> 4)
 */
function formatDisplayAmount(valueStr, decimals = 18, displayDecimals = 4) {
  try {
    const vStr = String(valueStr || '0');
    const dec = Number.isFinite(Number(decimals)) ? Number(decimals) : 18;
    const disp = Number.isFinite(Number(displayDecimals)) ? Number(displayDecimals) : 4;

    if (vStr.includes('.')) {
      const n = Number(vStr);
      return n.toLocaleString(undefined, { minimumFractionDigits: disp, maximumFractionDigits: disp });
    }

    // Si la cadena no es un entero decimal, fallback
    if (!safeIsIntegerString(vStr)) {
      const n = Number(vStr) || 0;
      return n.toLocaleString(undefined, { minimumFractionDigits: disp, maximumFractionDigits: disp });
    }

    // Si pequeño, usar Number
    if (vStr.length <= 15) {
      const n = Number(vStr) / Math.pow(10, dec);
      return n.toLocaleString(undefined, { minimumFractionDigits: disp, maximumFractionDigits: disp });
    }

    // BigInt path
    if (typeof BigInt !== 'undefined') {
      const big = BigInt(vStr);
      const base = BigInt(10) ** BigInt(dec);
      const intPart = big / base;
      let fracPart = big % base;

      // obtener dígitos suficientes para redondear
      const needed = disp + 1; // un dígito extra para redondeo
      let fracFull = fracPart.toString().padStart(dec, '0').slice(0, Math.max(needed, 0));
      // si fracFull es menor que needed, rellenar con ceros
      if (fracFull.length < needed) fracFull = fracFull.padEnd(needed, '0');

      let fracToRound = fracFull.slice(0, disp);
      const roundDigit = Number(fracFull.charAt(disp) || '0');

      // redondeo simple
      if (roundDigit >= 5) {
        let carry = BigInt(1);
        let fracNum = BigInt(fracToRound || '0') + carry;
        const maxFrac = BigInt(10) ** BigInt(disp);
        if (fracNum >= maxFrac) {
          // carry to int part
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

    // Fallback si no hay BigInt
    const fallback = Number(vStr) / Math.pow(10, dec);
    return fallback.toLocaleString(undefined, { minimumFractionDigits: disp, maximumFractionDigits: disp });
  } catch (e) {
    return String(valueStr || '0');
  }
}

/**
 * amountToFloat
 * Convierte valueStr + decimals a Number (pérdida de precisión posible si es muy grande).
 * Se usa para cálculos USD; si el número es extremadamente grande puede perder precisión,
 * pero en la práctica para balances ETH/ERC-20 esto es aceptable.
 */
function amountToFloat(valueStr, decimals = 18) {
  try {
    const vStr = String(valueStr || '0');
    if (vStr.includes('.')) return Number(vStr);
    if (vStr.length <= 15) {
      return Number(vStr) / Math.pow(10, Number(decimals));
    }
    // BigInt path: construir string y parseFloat
    if (typeof BigInt !== 'undefined') {
      const dec = Number(decimals || 18);
      const big = BigInt(vStr);
      const base = BigInt(10) ** BigInt(dec);
      const intPart = big / base;
      let fracPart = big % base;
      // Obtener 8 decimales para float (suficiente para USD multiplications)
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

export async function loadTx() {
  const tbody = document.getElementById('txBody');
  if (!tbody) return;

  const slice = txList.slice(offset, offset + 10);
  const grouped = {};

  for (const tx of slice) {
    if (!tx || !tx.timeStamp) continue;

    // tx.timeStamp puede ser string o número (segundos)
    const tsNum = Number(tx.timeStamp);
    if (!tsNum) continue;

    const date = new Date(tsNum * 1000).toLocaleDateString('es-ES');

    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(tx);
  }

  // Pre-load images if possible (optional, helps layout stability)
  // await Promise.all(slice.filter(tx => tx.tokenSymbol === 'USUAL' || tx.tokenSymbol === 'USUALX' ...).map(...));

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

      // Determinar símbolo y decimales:
      // Para ERC20: tokenSymbol, tokenDecimal (Etherscan tokentx)
      // Para nativas: tokenSymbol puede no existir -> asumimos ETH y 18 decimales
      const sym = tx.tokenSymbol || tx.symbol || (tx.input && tx.input !== '0x' ? 'ETH' : 'ETH') || 'ETH';
      const dec = (tx.tokenDecimal !== undefined && tx.tokenDecimal !== null) ? Number(tx.tokenDecimal) : ((tx.decimals !== undefined && tx.decimals !== null) ? Number(tx.decimals) : 18);
      const rawValue = tx.value ?? tx.tokenValue ?? tx.amount ?? '0';

      // formato de cantidad para mostrar
      const displayDecimals = sym === 'ETH' ? 6 : 4;
      const amtFormatted = formatDisplayAmount(String(rawValue || '0'), dec, displayDecimals);

      // para cálculos USD, obtener float (puede perder precision en casos ~extremos)
      const amtFloat = amountToFloat(String(rawValue || '0'), dec);

      let icon = '';

      if (sym === 'USUAL') icon = '<img src="https://etherscan.io/token/images/usualtoken_32.svg" alt="USUAL" id="icon">';
      else if (sym === 'USUALX') icon = '<img src="https://etherscan.io/token/images/usualx_32.png" alt="USUALX" id="icon">';
      else if (sym === 'USD0') icon = '<img src="https://static.coinstats.app/coins/usual-usdE9O.png" alt="USD0" id="icon">';
      else if (sym === 'BIO') icon = '<img src="https://etherscan.io/token/images/bioxyz_32.png" alt="BIO" id="icon">';
      else if (sym === 'ETH') icon = '<img src="./images/Eth-icon-purple.png" alt="ETH" id="icon">';
      else if (sym === 'USDC') icon = '<img src="https://etherscan.io/token/images/usdc_ofc_32.svg" alt="USDC" id="icon">';
      else if (sym === 'USDT') icon = '<img src="https://etherscan.io/token/images/tethernew_32.svg" alt="USDT" id="icon">';

      let amountText = isSent ? `<span class='tx-amount sent'>- ${amtFormatted}</span>` : `<span class='tx-amount'>+ ${amtFormatted}</span>`;

      // Precio actual y histórico
      let priceUSD = 0;
      try {
        if (sym.toUpperCase() !== 'ERC20') {
          priceUSD = await getTokenPriceUSD(sym === 'ETH' ? 'ETH' : sym);
        }
      } catch (e) {
        priceUSD = 0;
      }

      let usd = amtFloat * (priceUSD || 0);
      const txDateObj = new Date(Number(tx.timeStamp) * 1000);

      let priceHist = null;
      try {
        if (sym.toUpperCase() !== 'ERC20') {
          priceHist = await getHistoricalTokenPriceUSD(sym === 'ETH' ? 'ETH' : sym, txDateObj);
        }
      } catch (e) {
        priceHist = null;
      }

      let noData = false;

      if (!priceHist || priceHist === 0) { noData = true; priceHist = null; }

      let usdHist = amtFloat * (priceHist || 0);
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

/* ------------------ Fetch y merge (ERC20 + native) ------------------ */

export async function fetchAndShowTransactions(address) {
  offset = 0; txList = []; currentTxAddress = address;
  const tbody = document.getElementById('txBody');

  if (tbody) tbody.innerHTML = '';

  if (!address) return;

  try {
    // Hacemos ambas llamadas en paralelo:
    //  - tokentx: ERC20 token transfers
    //  - txlist: normal transactions (incluye transfers de ETH)
    const tokentxUrl = `${ETH_API}?chainid=1&module=account&action=tokentx&address=${address}&sort=desc&apikey=${ETH_KEY}`;
    const txlistUrl = `${ETH_API}?chainid=1&module=account&action=txlist&address=${address}&sort=desc&apikey=${ETH_KEY}`;

    const [r1, r2] = await Promise.allSettled([makeRequest(tokentxUrl), makeRequest(txlistUrl)]);

    let tokenTxs = [];
    let normalTxs = [];

    if (r1.status === 'fulfilled' && r1.value && Array.isArray(r1.value.result)) {
      tokenTxs = r1.value.result;
    }

    if (r2.status === 'fulfilled' && r2.value && Array.isArray(r2.value.result)) {
      normalTxs = r2.value.result;
    }

    // Normalizar / marcar native txs para que tengan campos similares a tokentx
    const nativeAsTokenStyle = normalTxs
      .filter(t => t && t.timeStamp) // asegurarnos
      .map(t => {
        // Algunos txlist pueden tener contractAddress vacío; valor nativo viene en 'value' (wei)
        return Object.assign({}, t, {
          // Forzamos campos esperados por la UI
          tokenSymbol: 'ETH',
          tokenDecimal: 18,
          // value ya existe (wei). Dejamos como string
          value: t.value ?? '0',
          // margen: conservar propiedades from/to/timeStamp/hash
        });
      });

    // Combinar: tokens + native txs
    const combined = [
      ...tokenTxs,
      ...nativeAsTokenStyle
    ];

    // Eliminar duplicados simples (mismo hash y mismo tokenSymbol y mismo value)
    const seen = new Set();
    const dedup = [];
    for (const tx of combined) {
      const key = `${tx.hash || tx.transactionHash || tx.txHash}-${(tx.tokenSymbol || '')}-${String(tx.value || '')}`;
      if (!seen.has(key)) {
        seen.add(key);
        // normalizar nombres comunes de hash/timeStamp
        const normalized = Object.assign({}, tx);
        normalized.hash = normalized.hash || normalized.transactionHash || normalized.txHash || normalized.hash;
        normalized.timeStamp = normalized.timeStamp || normalized.timestamp || normalized.time || normalized.blockNumber || normalized.timeStamp;
        dedup.push(normalized);
      }
    }

    // Orden por timestamp descendente
    dedup.sort((a, b) => {
      const ta = Number(a.timeStamp) || 0;
      const tb = Number(b.timeStamp) || 0;
      return tb - ta;
    });

    txList = dedup;
    // render inicial
    loadTx();
  } catch (error) {
    console.error('Error fetching transactions:', error);
  }
}

// export para uso externo si necesario
export { txList as _txListRef };
