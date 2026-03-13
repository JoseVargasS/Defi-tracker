// js/chartAdvanced.js
// Funciones avanzadas para el gráfico de velas
import { state } from './state.js';

// ============================================
// INDICADORES TÉCNICOS
// ============================================

// Calcular SMA (Simple Moving Average)
export function calculateSMA(data, period) {
  const sma = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      sma.push({ x: data[i].x, y: null });
      continue;
    }
    const slice = data.slice(i - period + 1, i + 1);
    const sum = slice.reduce((acc, d) => acc + d.c, 0);
    sma.push({ x: data[i].x, y: sum / period });
  }
  return sma;
}

// Calcular EMA (Exponential Moving Average)
export function calculateEMA(data, period) {
  const ema = [];
  const multiplier = 2 / (period + 1);

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i].c;
  }
  let prevEMA = sum / period;

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      ema.push({ x: data[i].x, y: null });
    } else if (i === period - 1) {
      ema.push({ x: data[i].x, y: prevEMA });
    } else {
      const currentEMA = (data[i].c - prevEMA) * multiplier + prevEMA;
      ema.push({ x: data[i].x, y: currentEMA });
      prevEMA = currentEMA;
    }
  }
  return ema;
}

// Calcular RSI (Relative Strength Index)
export function calculateRSI(data, period = 14) {
  const rsi = [];
  const gains = [];
  const losses = [];

  for (let i = 1; i < data.length; i++) {
    const change = data[i].c - data[i - 1].c;
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }

  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < period; i++) {
    avgGain += gains[i];
    avgLoss += losses[i];
  }
  avgGain /= period;
  avgLoss /= period;

  rsi.push({ x: data[0].x, y: null });

  for (let i = 0; i < period - 1; i++) {
    rsi.push({ x: data[i + 1].x, y: null });
  }

  if (avgLoss === 0) {
    rsi.push({ x: data[period].x, y: 100 });
  } else {
    const rs = avgGain / avgLoss;
    rsi.push({ x: data[period].x, y: 100 - (100 / (1 + rs)) });
  }

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;

    if (avgLoss === 0) {
      rsi.push({ x: data[i + 1].x, y: 100 });
    } else {
      const rs = avgGain / avgLoss;
      rsi.push({ x: data[i + 1].x, y: 100 - (100 / (1 + rs)) });
    }
  }

  return rsi;
}

// Calcular MACD
export function calculateMACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const ema12 = calculateEMA(data, fastPeriod);
  const ema26 = calculateEMA(data, slowPeriod);

  const macdLine = [];
  const signalLine = [];
  const histogram = [];

  for (let i = 0; i < data.length; i++) {
    if (ema12[i].y !== null && ema26[i].y !== null) {
      macdLine.push({ x: data[i].x, y: ema12[i].y - ema26[i].y });
    } else {
      macdLine.push({ x: data[i].x, y: null });
    }
  }

  const validMacd = macdLine.filter(d => d.y !== null);
  if (validMacd.length >= signalPeriod) {
    const validData = data.filter((_, i) => macdLine[i].y !== null);
    const signalEMA = calculateEMA(validData.map(d => ({ c: d.y })), signalPeriod);

    let signalIndex = 0;
    for (let i = 0; i < macdLine.length; i++) {
      if (macdLine[i].y !== null) {
        if (signalIndex < signalEMA.length) {
          signalLine.push({ x: data[i].x, y: signalEMA[signalIndex].y });
          histogram.push({ x: data[i].x, y: macdLine[i].y - signalEMA[signalIndex].y });
          signalIndex++;
        } else {
          signalLine.push({ x: data[i].x, y: null });
          histogram.push({ x: data[i].x, y: null });
        }
      } else {
        signalLine.push({ x: data[i].x, y: null });
        histogram.push({ x: data[i].x, y: null });
      }
    }
  } else {
    for (let i = 0; i < data.length; i++) {
      signalLine.push({ x: data[i].x, y: null });
      histogram.push({ x: data[i].x, y: null });
    }
  }

  return { macdLine, signalLine, histogram };
}

// Calcular Volumen
export function calculateVolume(data) {
  return data.map(d => ({
    x: d.x,
    y: d.v || 0,
    color: d.c >= d.o ? '#00b07c' : '#f23645'
  }));
}

// Calcular Stochastic RSI
export function calculateStochRSI(data, rsiPeriod = 14, stochPeriod = 14, kPeriod = 3, dPeriod = 3) {
  const rsi = calculateRSI(data, rsiPeriod);
  const stochRsiK = [];
  const stochRsiD = [];

  // Filtrar valores no nulos de RSI
  const rsiValues = rsi.filter(d => d.y !== null);
  const rsiOffset = rsi.length - rsiValues.length;

  const kValues = [];

  for (let i = 0; i < rsiValues.length; i++) {
    if (i < stochPeriod - 1) {
      kValues.push(null);
      continue;
    }

    const slice = rsiValues.slice(i - stochPeriod + 1, i + 1);
    const lowRSI = Math.min(...slice.map(d => d.y));
    const highRSI = Math.max(...slice.map(d => d.y));

    if (highRSI === lowRSI) {
      kValues.push(0);
    } else {
      const k = ((rsiValues[i].y - lowRSI) / (highRSI - lowRSI)) * 100;
      kValues.push(k);
    }
  }

  // Suavizado K
  const smoothedK = [];
  for (let i = 0; i < kValues.length; i++) {
    if (i < kPeriod - 1 || kValues[i] === null) {
      smoothedK.push(null);
      continue;
    }
    const slice = kValues.slice(i - kPeriod + 1, i + 1);
    if (slice.some(v => v === null)) {
      smoothedK.push(null);
      continue;
    }
    const avgK = slice.reduce((a, b) => a + b, 0) / kPeriod;
    smoothedK.push(avgK);
  }

  // Suavizado D
  const smoothedD = [];
  for (let i = 0; i < smoothedK.length; i++) {
    if (i < dPeriod - 1 || smoothedK[i] === null) {
      smoothedD.push(null);
      continue;
    }
    const slice = smoothedK.slice(i - dPeriod + 1, i + 1);
    if (slice.some(v => v === null)) {
      smoothedD.push(null);
      continue;
    }
    const avgD = slice.reduce((a, b) => a + b, 0) / dPeriod;
    smoothedD.push(avgD);
  }

  // Mapear de vuelta a la línea de tiempo original
  for (let i = 0; i < rsi.length; i++) {
    const valIdx = i - rsiOffset;
    if (valIdx >= 0) {
      stochRsiK.push({ x: rsi[i].x, y: smoothedK[valIdx] });
      stochRsiD.push({ x: rsi[i].x, y: smoothedD[valIdx] });
    } else {
      stochRsiK.push({ x: rsi[i].x, y: null });
      stochRsiD.push({ x: rsi[i].x, y: null });
    }
  }

  return { k: stochRsiK, d: stochRsiD };
}

// ============================================
// TOOLTIP AVANZADO
// ============================================

export function createAdvancedTooltipPlugin() {
  return {
    id: 'advancedTooltip',
    afterDraw(chart) {
      if (!chart.crosshair || chart.crosshair.x === null) return;

      const ctx = chart.ctx;
      const crosshair = chart.crosshair;

      let candleData = null;
      if (crosshair.snapIndex !== null && chart.data.datasets[0]?.data) {
        candleData = chart.data.datasets[0].data[crosshair.snapIndex];
      }

      if (!candleData) return;

      const tooltipWidth = 150;
      const tooltipHeight = 135;
      let tooltipX = crosshair.x + 15;
      let tooltipY = chart.chartArea.top + 10;

      if (tooltipX + tooltipWidth > chart.width) {
        tooltipX = crosshair.x - tooltipWidth - 15;
      }
      if (tooltipY + tooltipHeight > chart.chartArea.bottom) {
        tooltipY = chart.chartArea.bottom - tooltipHeight - 10;
      }

      ctx.save();
      ctx.fillStyle = 'rgba(26, 30, 40, 0.4)';
      ctx.strokeStyle = '#45B26B';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight, 8);
      } else {
        ctx.rect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
      }
      ctx.fill();
      ctx.stroke();

      const date = new Date(candleData.x);
      const dateStr = date.toLocaleDateString('es-ES', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });

      ctx.fillStyle = '#45B26B';
      ctx.font = 'bold 12px Inter, Arial';
      ctx.textAlign = 'left';
      ctx.fillText(dateStr, tooltipX + 12, tooltipY + 22);

      ctx.strokeStyle = '#353945';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tooltipX + 8, tooltipY + 32);
      ctx.lineTo(tooltipX + tooltipWidth - 8, tooltipY + 32);
      ctx.stroke();

      const isGreen = candleData.c >= candleData.o;
      const priceColor = isGreen ? '#0ecb81' : '#f6465d';

      ctx.font = '11px Inter, Arial';

      ctx.fillStyle = '#aaa';
      ctx.fillText('Open', tooltipX + 12, tooltipY + 50);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'right';
      ctx.fillText(candleData.o?.toFixed?.(2) || '-', tooltipX + tooltipWidth - 12, tooltipY + 50);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#aaa';
      ctx.fillText('High', tooltipX + 12, tooltipY + 68);
      ctx.fillStyle = '#0ecb81';
      ctx.textAlign = 'right';
      ctx.fillText(candleData.h?.toFixed?.(2) || '-', tooltipX + tooltipWidth - 12, tooltipY + 68);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#aaa';
      ctx.fillText('Low', tooltipX + 12, tooltipY + 86);
      ctx.fillStyle = '#f6465d';
      ctx.textAlign = 'right';
      ctx.fillText(candleData.l?.toFixed?.(2) || '-', tooltipX + tooltipWidth - 12, tooltipY + 86);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#aaa';
      ctx.fillText('Close', tooltipX + 12, tooltipY + 104);
      ctx.fillStyle = priceColor;
      ctx.textAlign = 'right';
      ctx.fillText(candleData.c?.toFixed?.(2) || '-', tooltipX + tooltipWidth - 12, tooltipY + 104);

      const change = candleData.c - candleData.o;
      const changePct = (change / candleData.o) * 100;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#aaa';
      ctx.fillText('Change', tooltipX + 12, tooltipY + 122);
      ctx.fillStyle = priceColor;
      ctx.textAlign = 'right';
      ctx.fillText(`${change >= 0 ? '+' : ''}${change?.toFixed?.(2) || '-'} (${changePct >= 0 ? '+' : ''}${changePct?.toFixed?.(2) || '-'}%)`, tooltipX + tooltipWidth - 12, tooltipY + 122);

      if (candleData.v) {
        ctx.textAlign = 'left';
        ctx.fillStyle = '#aaa';
        ctx.fillText('Volume', tooltipX + 12, tooltipY + 140);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'right';
        ctx.fillText(candleData.v?.toLocaleString?.() || '-', tooltipX + tooltipWidth - 12, tooltipY + 140);
      }

      ctx.restore();
    }
  };
}

// ============================================
// PANEL DE INDICADORES - ELIMINADO
// ============================================
