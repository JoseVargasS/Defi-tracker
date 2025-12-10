// js/pairs.js
//Contiene UI de pares, rendering de tracked pairs y renderCandlestick. Importante: usa state para variables compartidas.
import { state } from './state.js';
import { formatPrice } from './utils.js';
import { fetchPrice, fetch24hStats, fetchHTXCandles, fetchKlines } from './exchange.js';
import { names } from './state.js'

// crosshairPlugin (igual lógica que tenías)
export const crosshairPlugin = {
  id: 'crosshair',
  afterInit(chart) {
    if (!chart.canvas) return;
    chart.crosshair = { x: null, y: null, snapIndex: null };
    const moveListener = function (e) {
      if (!chart.canvas) return;
      const rect = chart.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      let minDist = Infinity;
      let snapIndex = null;
      let snapX = mouseX;
      if (chart.data.datasets && chart.data.datasets[0] && chart.data.datasets[0].data) {
        chart.data.datasets[0].data.forEach((d, i) => {
          const xPx = chart.scales.x.getPixelForValue(d.x);
          const dist = Math.abs(mouseX - xPx);
          if (dist < minDist) {
            minDist = dist;
            snapIndex = i;
            snapX = xPx;
          }
        });
      }
      chart.crosshair.x = snapX;
      chart.crosshair.y = mouseY;
      chart.crosshair.snapIndex = snapIndex;
      chart.draw();
    };
    const leaveListener = function () {
      chart.crosshair.x = null;
      chart.crosshair.y = null;
      chart.crosshair.snapIndex = null;
      chart.draw();
    };
    chart.canvas.addEventListener('mousemove', moveListener);
    chart.canvas.addEventListener('mouseleave', leaveListener);
    chart.crosshair.moveListener = moveListener;
    chart.crosshair.leaveListener = leaveListener;
  },
  beforeDestroy(chart) {
    if (chart.canvas && chart.crosshair) {
      chart.canvas.removeEventListener('mousemove', chart.crosshair.moveListener);
      chart.canvas.removeEventListener('mouseleave', chart.crosshair.leaveListener);
    }
  },
  afterDraw(chart) {
    if (chart.crosshair && chart.crosshair.x !== null && chart.crosshair.y !== null) {
      const ctx = chart.ctx;
      ctx.save();
      ctx.strokeStyle = '#45B26B';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(chart.crosshair.x, chart.chartArea.top);
      ctx.lineTo(chart.crosshair.x, chart.chartArea.bottom);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(chart.chartArea.left, chart.crosshair.y);
      ctx.lineTo(chart.chartArea.right, chart.crosshair.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Y label
      let yValue = chart.scales.y.getValueForPixel(chart.crosshair.y);
      let yLabel = (yValue !== undefined && yValue !== null && !isNaN(yValue)) ? yValue.toFixed(4) : '';
      if (yLabel) {
        ctx.font = '12px Inter, Arial';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        const labelWidth = ctx.measureText(yLabel).width + 18;
        const labelHeight = 24;
        let boxX = chart.crosshair.x - labelWidth / 2;
        let boxY = chart.crosshair.y - labelHeight - 8;
        if (boxX < chart.chartArea.left) boxX = chart.chartArea.left + 2;
        if (boxX + labelWidth > chart.chartArea.right) boxX = chart.chartArea.right - labelWidth - 2;
        if (boxY < chart.chartArea.top) boxY = chart.crosshair.y + 8;
        ctx.fillStyle = '#23262F';
        ctx.strokeStyle = '#45B26B';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(boxX, boxY, labelWidth, labelHeight, 7);
        else ctx.rect(boxX, boxY, labelWidth, labelHeight);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#F4F4F4';
        ctx.fillText(yLabel, boxX + labelWidth / 2, boxY + labelHeight / 2);
      }

      // X label
      let xValue = null;
      if (chart.crosshair.snapIndex !== null && chart.data.datasets && chart.data.datasets[0] && chart.data.datasets[0].data) {
        const d = chart.data.datasets[0].data[chart.crosshair.snapIndex];
        xValue = d.x;
      } else {
        xValue = chart.scales.x.getValueForPixel(chart.crosshair.x);
      }
      if (xValue) {
        const date = new Date(xValue);
        let dateLabel = '';
        let interval = window.currentInterval || '1d';
        if (interval === '1d' || interval === '3d') {
          dateLabel = date.toLocaleDateString();
        } else if (['4h', '1h', '15m', '5m', '1m', '3d'].includes(interval)) {
          const day = String(date.getDate()).padStart(2, '0');
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const year = date.getFullYear();
          const hour = String(date.getHours()).padStart(2, '0');
          const min = String(date.getMinutes()).padStart(2, '0');
          dateLabel = `${day}/${month}/${year} ${hour}:${min}`;
        } else {
          dateLabel = date.toLocaleString();
        }
        ctx.font = '12px Inter, Arial';
        ctx.textBaseline = 'top';
        ctx.textAlign = 'center';
        const labelWidth = ctx.measureText(dateLabel).width + 16;
        const labelHeight = 22;
        let xBoxX = chart.crosshair.x - labelWidth / 2;
        if (xBoxX + labelWidth > chart.width) xBoxX = chart.width - labelWidth - 6;
        if (xBoxX < 0) xBoxX = 6;
        let xBoxY = chart.chartArea.bottom + 6;
        if (xBoxY + labelHeight > chart.height) xBoxY = chart.chartArea.bottom - labelHeight - 6;
        ctx.fillStyle = '#23262F';
        ctx.strokeStyle = '#45B26B';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(xBoxX, xBoxY, labelWidth, labelHeight, 6);
        else ctx.rect(xBoxX, xBoxY, labelWidth, labelHeight);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#F4F4F4';
        ctx.fillText(dateLabel, xBoxX + labelWidth / 2, xBoxY + 11);
      }
      ctx.restore();
    }
  }
};

// helpers UI
function getCoinName(symbol) {
  const base = symbol.replace('USDT', '').toUpperCase();

  return names[base] || base;
}

export function createPairHtml(symbol, price, stats) {
  const base = symbol.replace('USDT', '');
  let change = '', changeClass = '', changeIcon = '';
  if (stats && stats.priceChangePercent !== undefined) {
    const pct = parseFloat(stats.priceChangePercent);
    change = pct.toFixed(2) + '%';
    changeClass = pct > 0 ? 'positive' : (pct < 0 ? 'negative' : '');
    changeIcon = pct > 0 ? '<span class="arrow">▲</span>' : (pct < 0 ? '<span class="arrow">▼</span>' : '');
  }
  state.lastPrices[symbol] = price;
  const source = symbol === 'CTXCUSDT' ? 'HTX' : 'Binance';
  const sourceUrl = source === 'HTX' ? 'https://www.htx.com/' : 'https://www.binance.com/';
  let infoHtml = `<div class="coin-info">
    <span class="coin-name">${getCoinName(symbol)}</span>
    <span class="coin-symbol">${base}/USDT <a class="pair-source-link" href="${sourceUrl}" target="_blank">${source}</a></span>
  </div>`;
  const html = `<div class="tracked-pair" data-symbol="${symbol}">
    ${infoHtml}
    <span class="pair-price" data-symbol="${symbol}">${formatPrice(price)}</span>
    <span class="pair-change ${changeClass}" data-symbol="${symbol}">${changeIcon}${change}</span>
    <button class="delete-btn" onclick="event.stopPropagation();window.removeTrackedPair && window.removeTrackedPair('${symbol}')" title="Eliminar">✕</button>
  </div>`;
  const temp = document.createElement('div');
  temp.innerHTML = html;
  const el = temp.firstElementChild;
  el.onclick = () => showPairDetails(symbol);
  return el;
}

export async function renderTrackedPairs() {
  const trackedPairs = document.getElementById('tracked-pairs');
  if (!trackedPairs) return;
  trackedPairs.innerHTML = '';
  for (const symbol of state.tracked) {
    const price = await fetchPrice(symbol);
    const stats = await fetch24hStats(symbol);
    const el = createPairHtml(symbol, price, stats);
    trackedPairs.appendChild(el);
  }
  // mantener compatibilidad global
  window.removeTrackedPair = removeTrackedPair;
}

export async function addTrackedPair(symbol) {
  if (!symbol) return;
  if (!state.tracked.includes(symbol)) {
    state.tracked.push(symbol);
    localStorage.setItem('trackedPairs', JSON.stringify(state.tracked));

    // Optimización: Agregar solo el nuevo elemento al DOM sin recargar todo
    const trackedPairs = document.getElementById('tracked-pairs');
    if (trackedPairs) {
      // Mostrar placeholder o loading si se desea, o esperar fetch
      try {
        const price = await fetchPrice(symbol);
        const stats = await fetch24hStats(symbol);
        const el = createPairHtml(symbol, price, stats);
        trackedPairs.appendChild(el);
      } catch (e) {
        console.error('Error adding pair UI:', e);
      }
    } else {
      // Fallback si no existe el contenedor (raro)
      renderTrackedPairs();
    }
  }
}

export function removeTrackedPair(symbol) {
  state.tracked = state.tracked.filter(s => s !== symbol);
  localStorage.setItem('trackedPairs', JSON.stringify(state.tracked));

  // Optimización: Eliminar solo el elemento del DOM
  const el = document.querySelector(`.tracked-pair[data-symbol="${symbol}"]`);
  if (el) {
    el.remove();
  } else {
    // Fallback por si acaso
    renderTrackedPairs();
  }
}

// Helper: Calculate Bollinger Bands
function calculateBollingerBands(data, period = 20, multiplier = 2) {
  const bands = { upper: [], middle: [], lower: [] };

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      bands.upper.push({ x: data[i].x, y: null });
      bands.middle.push({ x: data[i].x, y: null });
      bands.lower.push({ x: data[i].x, y: null });
      continue;
    }

    const slice = data.slice(i - period + 1, i + 1);
    const sum = slice.reduce((acc, d) => acc + d.c, 0);
    const sma = sum / period;

    const squaredDiffs = slice.map(d => Math.pow(d.c - sma, 2));
    const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / period;
    const stdDev = Math.sqrt(variance);

    bands.upper.push({ x: data[i].x, y: sma + (stdDev * multiplier) });
    bands.middle.push({ x: data[i].x, y: sma });
    bands.lower.push({ x: data[i].x, y: sma - (stdDev * multiplier) });
  }
  return bands;
}

// Candlestick renderer (adaptado para usar fetchKlines)
export async function renderCandlestick(symbol, interval) {
  if (state.candleRenderLock) return;
  state.candleRenderLock = true;
  try {
    const candlestickChart = document.getElementById('candlestick-chart');
    if (!candlestickChart) {
      console.error('Canvas element not found!');
      return;
    }

    let rawData = [];
    if (symbol === 'CTXCUSDT') {
      const htxData = await fetchHTXCandles(symbol, interval);
      rawData = htxData.map(d => ({ x: d.id * 1000, o: d.open, h: d.high, l: d.low, c: d.close }));
    } else {
      const binData = await fetchKlines(symbol, interval);
      rawData = (Array.isArray(binData) ? binData : []).map(d => ({ x: d[0], o: parseFloat(d[1]), h: parseFloat(d[2]), l: parseFloat(d[3]), c: parseFloat(d[4]) }));
    }

    const totalDataPoints = rawData.length;
    // Recalcular zoom/start si es necesario
    let start = Math.max(0, totalDataPoints - state.chartZoom);
    let end = totalDataPoints;

    // Calcular bandas para TODO el rawData para mantener consistencia
    const bandsFull = calculateBollingerBands(rawData);

    // Filter visible data
    const visibleData = rawData.slice(start, end);
    const visibleBands = {
      upper: bandsFull.upper.slice(start, end),
      middle: bandsFull.middle.slice(start, end),
      lower: bandsFull.lower.slice(start, end)
    };

    // INTENTAR UPDATE SIN RE-RENDER (Avoid flickering)
    if (state.chartInstance && state.chartInstance.canvas === candlestickChart && state.chartInstance._symbol === symbol && state.chartInstance._interval === interval) {
      try {
        if (state.chartInstance.data.datasets[0]) {
          const ds = state.chartInstance.data.datasets[0];
          ds.data = visibleData;

          // Re-force colors on update to ensure solidity
          const upC = '#0ecb81';
          const downC = '#f6465d';
          const neutC = '#999999';
          ds.color = { up: upC, down: downC, unchanged: neutC };
          ds.borderColor = { up: upC, down: downC, unchanged: neutC };
          ds.wickColor = { up: upC, down: downC, unchanged: neutC };
          ds.backgroundColor = { up: upC, down: downC, unchanged: neutC };

          // Asumimos datasets 1, 2, 3 son las bandas
          if (state.chartInstance.data.datasets[1]) state.chartInstance.data.datasets[1].data = visibleBands.upper;
          if (state.chartInstance.data.datasets[2]) state.chartInstance.data.datasets[2].data = visibleBands.lower;
          if (state.chartInstance.data.datasets[3]) state.chartInstance.data.datasets[3].data = visibleBands.middle;

          state.chartInstance.update('none');
          return;
        }
      } catch (err) {
        console.warn('Smart update error', err);
      }
    }

    // destruir chart previo
    try {
      const existing = Chart.getChart(candlestickChart);
      if (existing) { try { existing.destroy(); } catch (e) { } state.chartInstance = null; }
    } catch (e) {
      if (state.chartInstance) { try { state.chartInstance.destroy(); } catch (err) { } state.chartInstance = null; }
    }
    candlestickChart.onwheel = null;
    candlestickChart.onmousedown = null;
    candlestickChart.onmousemove = null;
    try { window.onmouseup = null; } catch (e) { }

    const ctx = candlestickChart.getContext('2d');
    if (!ctx) { console.error('Could not get canvas context!'); return; }

    state.chartInstance = new Chart(ctx, {
      type: 'candlestick',
      data: {
        datasets: [
          {
            label: symbol,
            data: visibleData,
            // Colores sólidos tipo TradingView/Binance
            // Intentar todas las propiedades posibles para forzar el relleno opaco
            backgroundColors: { up: '#0ecb81', down: '#f6465d', unchanged: '#999' },
            borderWidth: 1,
            order: 1
          },
          // Bollinger Bands Datasets
          {
            label: 'Bollinger Upper',
            data: visibleBands.upper,
            type: 'line',
            borderColor: 'rgba(157, 126, 224, 0.8)', // Violeta suave
            borderWidth: 1.35,
            pointRadius: 0,
            fill: false,
            order: 2
          },
          {
            label: 'Bollinger Lower',
            data: visibleBands.lower,
            type: 'line',
            borderColor: 'rgba(157, 126, 224, 0.8)', // Violeta suave
            backgroundColor: 'rgba(157, 126, 224, 0.068)', // Relleno tenue entre bandas
            borderWidth: 1.35,
            pointRadius: 0,
            fill: 1, // Llenar hasta el dataset indice 1 (Upper)
            order: 2
          },
          {
            label: 'Bollinger Middle',
            data: visibleBands.middle,
            type: 'line',
            borderColor: 'rgba(216, 21, 167, 0.86)', // Violeta más transparente
            borderWidth: 1.13,
            pointRadius: 0,
            fill: false,
            order: 2
          }
        ]
      },
      options: {
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { type: 'time', time: { unit: (interval === '1d' || interval === '3d') ? 'day' : ((interval === '4h' || interval === '1h') ? 'hour' : 'minute') }, grid: { color: '#353945' }, ticks: { color: '#F4F4F4' } },
          y: { grid: { color: '#353945' }, ticks: { color: '#F4F4F4' } }
        },
        responsive: true,
        maintainAspectRatio: false,
        aspectRatio: 2,
        animation: false
      },
      plugins: [crosshairPlugin]
    });

    state.chartInstance._symbol = symbol;
    state.chartInstance._interval = interval;

    // handlers para zoom/pan usando rawData y recalculando slices
    const updateChartSlice = () => {
      let currentEnd = start + state.chartZoom;
      if (currentEnd > rawData.length) {
        currentEnd = rawData.length;
        start = Math.max(0, currentEnd - state.chartZoom);
      }

      const newData = rawData.slice(start, currentEnd);
      const newBands = {
        upper: bandsFull.upper.slice(start, currentEnd),
        middle: bandsFull.middle.slice(start, currentEnd),
        lower: bandsFull.lower.slice(start, currentEnd)
      };

      if (state.chartInstance && state.chartInstance.data && state.chartInstance.data.datasets) {
        state.chartInstance.data.datasets[0].data = newData;
        // Update bands
        if (state.chartInstance.data.datasets[1]) state.chartInstance.data.datasets[1].data = newBands.upper;
        if (state.chartInstance.data.datasets[2]) state.chartInstance.data.datasets[2].data = newBands.lower;
        if (state.chartInstance.data.datasets[3]) state.chartInstance.data.datasets[3].data = newBands.middle;

        state.chartInstance.update('none');
      }
    };

    candlestickChart.onwheel = (e) => {
      e.preventDefault();
      if (e.deltaY < 0) state.chartZoom = Math.max(10, state.chartZoom - 10);
      else state.chartZoom = Math.min(state.chartZoom + 10, rawData.length);
      renderCandlestick(symbol, interval);
    };

    let isPanning = false, panStartX = 0, panStartIndex = start;
    candlestickChart.onmousedown = (e) => { isPanning = true; panStartX = e.clientX; panStartIndex = start; };
    window.onmouseup = () => { isPanning = false; };
    candlestickChart.onmousemove = (e) => {
      if (isPanning) {
        const dx = e.clientX - panStartX;
        const moveBars = Math.round(dx / 3);
        let newStart = panStartIndex - moveBars;
        newStart = Math.max(0, Math.min(rawData.length - state.chartZoom, newStart));

        if (newStart !== start) {
          start = newStart;
          // Usamos funcion interna para no re-crear todo el grafico, mas rapido
          updateChartSlice();
        }
      }
    };

  } finally {
    state.candleRenderLock = false;
  }
}

export function updatePairUI(symbol, price, stats) {
  const pairTitle = document.getElementById('pair-title');
  if (!pairTitle) return;

  const base = symbol.replace('USDT', '');
  const change = parseFloat(stats.priceChange || 0);
  const changePct = parseFloat(stats.priceChangePercent || 0);
  const changeClass = change > 0 ? 'positive' : (change < 0 ? 'negative' : '');
  pairTitle.innerHTML = `${base}/USDT <span>$${formatPrice(price)}</span> <span class="${changeClass}">${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%</span>`;

  const high = parseFloat(stats.highPrice || 0);
  const low = parseFloat(stats.lowPrice || 0);
  const volBase = parseFloat(stats.volume || 0);
  const volUSDT = parseFloat(stats.quoteVolume || 0);

  let statsContainer = document.querySelector('.pair-stats');
  if (!statsContainer) {
    // Crear contenedor si no existe
    statsContainer = document.createElement('div');
    statsContainer.className = 'pair-stats';
    pairTitle.insertAdjacentElement('afterend', statsContainer);
  }

  statsContainer.innerHTML = `
      <div><span class="label">24h Change</span> <span class="pair-change ${changeClass}">${change >= 0 ? '+' : ''}${change.toFixed(4)} ${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%</span></div>
      <div><span class="label">24h High</span> <span>${high}</span></div>
      <div><span class="label">24h Low</span> <span>${low}</span></div>
      <div><span class="label">24h Volume (${base})</span> <span>${volBase?.toLocaleString?.() ?? '-'}</span></div>
      <div><span class="label">24h Volume (USDT)</span> <span>${volUSDT?.toLocaleString?.() ?? '-'}</span></div>
    `;
}

export async function refreshPairDetails(symbol) {
  if (state.currentPair !== symbol) return; // Evitar updates si cambió el par
  const price = await fetchPrice(symbol);
  const stats = await fetch24hStats(symbol);
  updatePairUI(symbol, price, stats);
  renderCandlestick(symbol, state.currentInterval);
}

export async function showPairDetails(symbol) {
  const pairDetails = document.getElementById('pair-details');
  const pairTitle = document.getElementById('pair-title');
  const candlestickChart = document.getElementById('candlestick-chart');

  if (!pairDetails || !pairTitle || !candlestickChart) return;

  // Limpiar intervalo previo si existe
  if (state.detailInterval) {
    clearInterval(state.detailInterval);
    state.detailInterval = null;
  }

  state.currentPair = symbol;
  pairDetails.classList.remove('hidden');

  // Carga inicial
  await refreshPairDetails(symbol);

  // Iniciar polling de 5 segundos
  state.detailInterval = setInterval(() => {
    refreshPairDetails(symbol);
  }, 5000);

  // Limpiar al cerrar details
  const closeBtn = document.getElementById('close-details');
  if (closeBtn) {
    // Remover listeners previos para evitar duplicados (simple approach)
    const newBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newBtn, closeBtn);
    newBtn.onclick = () => {
      if (state.detailInterval) {
        clearInterval(state.detailInterval);
        state.detailInterval = null;
      }
      pairDetails.classList.add('hidden');
      state.currentPair = null;
    };
  }
}
