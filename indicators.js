// indicators.js - Módulo de Indicadores Técnicos com VWAP por Período (Diária, Semanal, Mensal)

function calcEMA(data, period) {
 const k = 2 / (period + 1);
 let ema = [];
 let prev = data[0].c;
 data.forEach((d, i) => {
  if (i === 0) ema.push(prev);
  else {
   let val = (d.c * k) + (prev * (1 - k));
   ema.push(val);
   prev = val;
  }
 });
 return ema;
}

// Função auxiliar para determinar a chave do período da VWAP
function getPeriodKey(timestamp, type) {
 const date = new Date(timestamp);
 if (type === 'semanal') {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo}`;
 } else if (type === 'mensal') {
  return `${date.getFullYear()}-${date.getMonth()}`;
 } else {
  // Padrão: Diária
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
 }
}

function calcVWAP(data, periodType = 'diaria') {
 let vwap = [];
 let cumPV = 0, cumVol = 0;
 let currentPeriodKey = null;

 data.forEach(d => {
  let periodKey = getPeriodKey(d.t, periodType);
  
  // Reseta o acumulador quando muda o dia, semana ou mês
  if (periodKey !== currentPeriodKey) {
   currentPeriodKey = periodKey;
   cumPV = 0;
   cumVol = 0;
  }

  let tp = (d.h + d.l + d.c) / 3;
  let vol = d.v || 100;
  cumPV += tp * vol;
  cumVol += vol;
  vwap.push(cumVol > 0 ? cumPV / cumVol : tp);
 });
 return vwap;
}

function drawVWAP(g, p, vis, s0, Y) {
 if (!p.cs || p.cs.length === 0) return;
 const periodType = CHART_CONFIG.vwapPeriod || 'diaria';
 const vwapVals = calcVWAP(p.cs, periodType);
 
 g.strokeStyle = '#38bdf8';
 g.lineWidth = 1.5;
 g.beginPath();
 vis.forEach((k, i) => {
  const globalIdx = s0 + i;
  const x = i * p.z + p.z / 2;
  const y = Y(vwapVals[globalIdx]);
  if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
 });
 g.stroke();
}

function draw2MM(g, p, vis, s0, Y) {
 if (!p.cs || p.cs.length <= 8) return;
 const ema9 = calcEMA(p.cs, 9);
 const ema21 = calcEMA(p.cs, 21);

 g.strokeStyle = '#4ade80';
 g.lineWidth = 1.2;
 g.beginPath();
 vis.forEach((k, i) => {
  const globalIdx = s0 + i;
  const x = i * p.z + p.z / 2;
  const y = Y(ema9[globalIdx]);
  if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
 });
 g.stroke();

 g.strokeStyle = '#facc15';
 g.lineWidth = 1.2;
 g.beginPath();
 vis.forEach((k, i) => {
  const globalIdx = s0 + i;
  const x = i * p.z + p.z / 2;
  const y = Y(ema21[globalIdx]);
  if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
 });
 g.stroke();
}