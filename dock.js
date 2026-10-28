// dock.js — menu superior estilo Profit + janelas (Indicadores, Posição, Relatório, Automações)
// e correções de ordens/P&L. Carregado DEPOIS do app.js (as funções abaixo substituem as de mesmo nome).
var BK = {}, TRADES = [], DEALS = [], ACCINFO = {demo: true}, STRATS = {}, AUTOS = [], ALOG = [], OCO_PENDING = null, COST_LOT = 0;  // REPORT é declarado na seção do relatório

(function () {
 const st = document.createElement('style');
 st.textContent = `
#menubar{display:flex;align-items:center;height:26px;flex:none;background:#0a101c;border-bottom:1px solid #1e293b;padding:0 6px;position:relative;z-index:160;font-size:12px}
#menubar>button{background:none;border:0;color:#cbd5e1;padding:0 11px;height:100%;font-size:12px;font-weight:500;cursor:pointer;border-radius:0}
#menubar>button:hover,#menubar>button.on{background:#2563eb;color:#fff}#mbAcc{margin-left:auto;color:#94a3b8;font-size:11px}
.mdd{position:fixed;min-width:280px;background:#1a2130;border:1px solid #334155;border-radius:6px;box-shadow:0 12px 28px rgba(0,0,0,.55);padding:4px 0;z-index:170;display:none;font-size:12px}
.mdd div{display:flex;justify-content:space-between;gap:30px;padding:6px 16px;cursor:pointer;color:#cbd5e1}
.mdd div:hover{background:#2563eb;color:#fff}.mdd div span{color:#94a3b8}.mdd div:hover span{color:#dbeafe}
.mdd .mh{cursor:default;font-weight:700;font-size:11px;color:#e2e8f0;padding:8px 12px 4px;border-top:1px solid #2b3447}.mdd .mh:first-child{border-top:0}.mdd .mh:hover{background:none;color:#e2e8f0}
.qw{position:fixed;background:#111827;border:1px solid #334155;border-radius:6px;box-shadow:0 18px 40px rgba(0,0,0,.6);display:flex;flex-direction:column;font-size:11px;color:#cbd5e1}
.qw-h{display:flex;justify-content:space-between;align-items:center;padding:7px 12px;background:#0b1220;border-bottom:1px solid #1e293b;border-radius:6px 6px 0 0;cursor:move;font-weight:700;color:#f1f5f9;font-size:12px}
.qw-h i{font-style:normal;cursor:pointer;color:#94a3b8;padding:0 4px}.qw-h i:hover{color:#fff}.qw-b{flex:1;min-height:0;overflow:auto;padding:10px}
table.dk{width:100%;border-collapse:collapse}table.dk th{position:sticky;top:-10px;background:#111827;color:#64748b;text-align:right;padding:3px 6px;font-weight:600}
table.dk td{padding:3px 6px;text-align:right;border-top:1px solid #1e293b}table.dk th:first-child,table.dk td:first-child{text-align:left}
.dk-row{display:flex;gap:10px;align-items:flex-end;margin-bottom:8px;flex-wrap:wrap}
.dk-f{display:flex;flex-direction:column;gap:2px;width:92px}.dk-f label{font-size:10px;color:#9ca3af}
.dk-f input,.dk-f select,.qw select{width:100%;background:#1f2937;border:1px solid #374151;color:#f3f4f6;padding:3px 5px;border-radius:3px;font-size:11px;user-select:text}
.qw select{width:auto}.dk-f input[type=color]{padding:0;height:24px}
.dk-btn{background:#059669;color:#fff;border:0;border-radius:4px;padding:6px 14px;font-weight:700;cursor:pointer}.dk-btn.r{background:#b91c1c;padding:2px 8px}.dk-btn.g{background:#374151}
#aLog{background:#030712;border:1px solid #1e293b;border-radius:4px;padding:6px;height:70px;overflow:auto;font-family:monospace;color:#94a3b8;white-space:pre-wrap;margin-top:8px}
.ind-wrap{display:flex;height:100%;margin:-10px}.ind-l{width:230px;border-right:1px solid #1e293b;display:flex;flex-direction:column;padding:8px;gap:6px;background:#0d1424}
.ind-l input{background:#1f2937;border:1px solid #374151;color:#f3f4f6;padding:5px 8px;border-radius:4px;user-select:text}
.ind-tabs{display:flex}.ind-tabs button{flex:1;background:none;border:0;border-bottom:2px solid transparent;color:#94a3b8;font-weight:700;padding:6px;cursor:pointer;border-radius:0}
.ind-tabs button.on{color:#fff;border-bottom-color:#2563eb}#iList{overflow:auto;flex:1}
.ic{font-weight:700;color:#e2e8f0;background:#1a2130;padding:5px 8px;margin-top:6px;border-radius:3px}.ii{padding:6px 10px;cursor:pointer}.ii:hover,.ii.on{background:#1e293b;color:#38bdf8}
.ind-r{flex:1;padding:14px;overflow:auto;display:flex;flex-direction:column;gap:10px}.ind-r h2{font-size:17px;color:#f8fafc}.ind-r p{color:#94a3b8;line-height:1.5}
.chip2{display:inline-block;background:#1e293b;border:1px solid #334155;border-radius:4px;padding:3px 8px;margin:0 4px 4px 0;color:#e2e8f0}.chip2 b{cursor:pointer;color:#94a3b8;margin-left:4px}.chip2 b:hover{color:#f43f5e}`;
 document.head.appendChild(st);
})();

// ================= janelas =================
let zTop = 150;
function qwin(id, title, w, h, html) {
 let el = $('w_' + id);
 if (el) { el.style.zIndex = ++zTop; return null; }
 el = document.createElement('div'); el.className = 'qw'; el.id = 'w_' + id;
 el.style.cssText = `width:${w}px;height:${h}px;left:${Math.max(10, (innerWidth - w) / 2 + Math.random() * 40)}px;top:${55 + Math.random() * 30}px;z-index:${++zTop}`;
 el.innerHTML = `<div class="qw-h"><span>${title}</span><i>✕</i></div><div class="qw-b">${html}</div>`;
 document.body.appendChild(el);
 const hd = el.firstChild;
 hd.querySelector('i').onclick = () => el.remove();
 el.onmousedown = () => { el.style.zIndex = ++zTop; };
 hd.onmousedown = e => {
  if (e.target.tagName === 'I') return;
  const dx = e.clientX - el.offsetLeft, dy = e.clientY - el.offsetTop;
  const mv = ev => { el.style.left = ev.clientX - dx + 'px'; el.style.top = Math.max(0, ev.clientY - dy) + 'px'; };
  const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
  addEventListener('mousemove', mv); addEventListener('mouseup', up);
 };
 return el;
}

// ================= indicadores =================
const INDS = {
 VWAP: {n: 'VWAP', cat: 'Volume', c: '#d946ef', d: 'Preço médio ponderado pelo volume, reiniciado a cada período (dia, semana ou mês). Referência de “preço justo” muito usada no day trade.',
  pr: [{k: 'per', l: 'Período', o: ['diaria', 'semanal', 'mensal']}]},
 MME: {n: 'Média Móvel Exponencial', cat: 'Tendência', c: '#4ade80', d: 'Média que dá mais peso aos candles recentes, reagindo mais rápido às mudanças de preço.', pr: [{k: 'n', l: 'Períodos', v: 9}]},
 MMA: {n: 'Média Móvel Aritmética', cat: 'Tendência', c: '#facc15', d: 'Média simples dos últimos N fechamentos.', pr: [{k: 'n', l: 'Períodos', v: 21}]},
 BOL: {n: 'Bandas de Bollinger', cat: 'Tendência', c: '#38bdf8', d: 'Média aritmética com bandas a N desvios padrão. Mostra a volatilidade e zonas de esticamento do preço.', pr: [{k: 'n', l: 'Períodos', v: 20}, {k: 'k', l: 'Desvios', v: 2}]},
};
const defaultInds = () => [{t: 'VWAP', per: CHART_CONFIG.vwapPeriod || 'diaria', c: '#38bdf8'}, {t: 'MME', n: 9, c: '#4ade80'}, {t: 'MME', n: 21, c: '#facc15'}];
const indName = i => i.t === 'VWAP' ? 'VWAP ' + ({diaria: 'D', semanal: 'S', mensal: 'M'}[i.per] || '') : i.t === 'BOL' ? `BOL ${i.n},${i.k}` : `${i.t} ${i.n}`;
function smaArr(cs, n) { return cs.map((_, x) => { if (x < n - 1) return null; let s = 0; for (let j = x - n + 1; j <= x; j++) s += cs[j].c; return s / n; }); }
function indLines(p, i) {
 const cs = p.cs;
 if (i.t === 'VWAP') return [calcVWAP(cs, i.per)];
 if (i.t === 'MME') return [calcEMA(cs, i.n)];
 if (i.t === 'MMA') return [smaArr(cs, i.n)];
 if (i.t === 'BOL') {
  const m = smaArr(cs, i.n), up = [], lo = [];
  m.forEach((v, x) => { if (v == null) { up.push(null); lo.push(null); return; }
   let s = 0; for (let j = x - i.n + 1; j <= x; j++) s += (cs[j].c - v) ** 2;
   const sd = Math.sqrt(s / i.n); up.push(v + i.k * sd); lo.push(v - i.k * sd); });
  return [m, up, lo];
 }
 return [];
}
// o app.js chama drawVWAP/draw2MM a cada desenho: agora desenham a lista de indicadores do gráfico
CHART_CONFIG.showVwap = true; CHART_CONFIG.show2MM = false;
function drawVWAP(g, p, vis, s0, Y) {
 (p.inds || (p.inds = defaultInds())).forEach(i => {
  indLines(p, i).forEach((arr, j) => {
   g.strokeStyle = i.c; g.lineWidth = (i.t === 'BOL' && j > 0) ? 1 : 1.5; g.beginPath();
   let on = false;
   vis.forEach((k, x) => {
    const v = arr[s0 + x]; if (v == null) { on = false; return; }
    const X = x * p.z + p.z / 2, YY = Y(v);
    on ? g.lineTo(X, YY) : g.moveTo(X, YY); on = true;
   });
   g.stroke();
  });
 });
}
function draw2MM() {}

let iSel = 'VWAP';
function openInd() {
 const el = qwin('ind', 'Indicadores', 800, 500, `<div class="ind-wrap">
  <div class="ind-l"><div class="ind-tabs"><button class="on" data-t="i">Indicador</button><button data-t="c">Coloração</button></div>
   <input id="iSearch" placeholder="Buscar"><div id="iList"></div></div>
  <div class="ind-r"><div id="iApplied"></div>
   <div id="iPane" style="display:flex;flex-direction:column;gap:10px"><h2 id="iTitle"></h2><p id="iDesc"></p><div class="dk-row" id="iParams"></div>
    <div class="dk-row"><button class="dk-btn" id="iOk">Inserir no gráfico</button><button class="dk-btn g" id="iClose">Fechar</button></div></div>
   <div id="cPane" style="display:none"><h2>Coloração do gráfico</h2><div class="dk-row" style="margin-top:12px">
    <div class="dk-f"><label>Fundo</label><input type="color" id="cBg"></div><div class="dk-f"><label>Candle de alta</label><input type="color" id="cUp"></div>
    <div class="dk-f"><label>Candle de baixa</label><input type="color" id="cDn"></div></div></div>
  </div></div>`);
 if (!el) return;
 $('iSearch').oninput = iRenderList;
 $('iList').onclick = e => { const d = e.target.closest('[data-k]'); if (d) { iSel = d.dataset.k; iRenderList(); iRenderRight(); } };
 el.querySelectorAll('.ind-tabs button').forEach(b => b.onclick = () => {
  el.querySelectorAll('.ind-tabs button').forEach(x => x.classList.toggle('on', x === b));
  $('iPane').style.display = b.dataset.t === 'i' ? 'flex' : 'none'; $('cPane').style.display = b.dataset.t === 'c' ? 'block' : 'none'; });
 $('cBg').value = CHART_CONFIG.bg; $('cUp').value = CHART_CONFIG.colorUp; $('cDn').value = CHART_CONFIG.colorDn;
 [['cBg', 'bg'], ['cUp', 'colorUp'], ['cDn', 'colorDn']].forEach(([id, k]) => $(id).oninput = e => { CHART_CONFIG[k] = e.target.value; drawAll(); });
 $('iApplied').onclick = e => { const x = e.target.dataset.x; if (x != null) { act.inds.splice(+x, 1); drawAll(); iApplied(); } };
 $('iClose').onclick = () => el.remove();
 $('iOk').onclick = () => {
  const i = {t: iSel, c: $('iCor').value};
  $('iParams').querySelectorAll('[data-k]').forEach(x => i[x.dataset.k] = x.tagName === 'SELECT' ? x.value : parseFloat(String(x.value).replace(',', '.')));
  (act.inds || (act.inds = defaultInds())).push(i); drawAll(); iApplied();
 };
 iRenderList(); iRenderRight(); iApplied();
}
function iRenderList() {
 const q = $('iSearch').value.toLowerCase(), cats = {};
 Object.entries(INDS).forEach(([k, v]) => { if (!q || v.n.toLowerCase().includes(q)) (cats[v.cat] = cats[v.cat] || []).push([k, v]); });
 $('iList').innerHTML = Object.entries(cats).map(([c, a]) => `<div class="ic">${c}</div>` + a.map(([k, v]) => `<div class="ii${k === iSel ? ' on' : ''}" data-k="${k}">${v.n}</div>`).join('')).join('');
}
function iRenderRight() {
 const v = INDS[iSel]; $('iTitle').textContent = v.n; $('iDesc').textContent = v.d;
 $('iParams').innerHTML = v.pr.map(p => p.o ? `<div class="dk-f"><label>${p.l}</label><select data-k="${p.k}">${p.o.map(o => `<option>${o}</option>`).join('')}</select></div>`
  : `<div class="dk-f"><label>${p.l}</label><input data-k="${p.k}" value="${p.v}"></div>`).join('') + `<div class="dk-f"><label>Cor</label><input type="color" id="iCor" value="${v.c}"></div>`;
}
function iApplied() {
 if (!$('iApplied') || !act) return;
 const L = act.inds || (act.inds = defaultInds());
 $('iApplied').innerHTML = `<div style="color:#64748b;margin-bottom:4px">Neste gráfico (${act.sym}):</div>` + (L.map((i, x) => `<span class="chip2">${indName(i)} <b data-x="${x}">✕</b></span>`).join('') || '<span style="color:#64748b">nenhum</span>');
}

// ================= posição =================
function openPos() {
 const el = qwin('pos', 'Posição', 640, 280, `<table class="dk"><thead><tr><th>Ativo</th><th>Lado</th><th>Qtd</th><th>Preço médio</th><th>Atual</th><th>Resultado</th><th></th></tr></thead><tbody id="pTb"></tbody></table>`);
 if (!el) return;
 $('pTb').onclick = e => { const s = e.target.dataset.z; if (s && A().pos[s]) order(s, -A().pos[s].q, null); };
 renderPos();
}
function renderPos() {
 const t = $('pTb'); if (!t) return;
 const rows = Object.entries(A().pos).map(([s, x]) => { const v = (px[s] - x.avg) * x.q * (SYMS[s] ? SYMS[s].pv : 1);
  return `<tr><td>${s}</td><td class="${x.q > 0 ? 'up' : 'dn'}">${x.q > 0 ? 'Comprado' : 'Vendido'}</td><td>${Math.abs(x.q)}</td><td>${fp(s, x.avg)}</td><td>${fp(s, px[s])}</td><td class="${v >= 0 ? 'up' : 'dn'}">${money(v)}</td><td><button class="dk-btn r" data-z="${s}">Zerar</button></td></tr>`; }).join('');
 t.innerHTML = rows || '<tr><td colspan="7" style="text-align:center;color:#64748b">Nenhuma posição aberta</td></tr>';
}

// ================= relatório de performance (histórico diário + gráficos) =================
var REPORT = null;
(function () {
 const st = document.createElement('style');
 st.textContent = '.hc{flex:1;min-width:0;height:150px;background:#0b1220;border:1px solid #1e293b;border-radius:4px}' +
  '.simg{display:flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid #334155;border-radius:6px;cursor:pointer;background:rgba(255,255,255,.02)}' +
  '.simg input{width:16px;height:16px;accent-color:#f59e0b}.simg input:checked~span{color:#f59e0b;font-weight:700}.simtag{background:#f59e0b;color:#111;border-radius:3px;padding:0 5px;font-weight:700;font-size:10px}' +
  '.kpi{display:inline-block;margin-right:14px}.kpi small{color:#64748b;display:block;font-size:10px}';
 document.head.appendChild(st);
})();
function reqReport() { if (ws && ws.readyState === 1 && $('hDays')) ws.send(JSON.stringify({action: 'get_report', days: +$('hDays').value})); }
function dayKey(t) { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function cfit(cv) {
 const d = devicePixelRatio || 1, w = cv.clientWidth || 300, h = cv.clientHeight || 150;
 cv.width = w * d; cv.height = h * d;
 const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h); g.font = '11px sans-serif'; g.textAlign = 'left';
 return [g, w, h];
}
function chartLine(cv, ys, title) {
 const [g, w, h] = cfit(cv); g.fillStyle = '#94a3b8'; g.fillText(title, 8, 14);
 if (ys.length < 2) { g.fillText(ys.length ? money(ys[0]) : 'sem dados', 8, h / 2); return; }
 const mn = Math.min(0, ...ys), mx = Math.max(0, ...ys), Y = v => h - 8 - (v - mn) / ((mx - mn) || 1) * (h - 32), X = i => 10 + i * (w - 20) / (ys.length - 1);
 g.strokeStyle = '#334155'; g.beginPath(); g.moveTo(0, Y(0)); g.lineTo(w, Y(0)); g.stroke();
 const fim = ys[ys.length - 1]; g.strokeStyle = fim >= 0 ? '#14b8a6' : '#f43f5e'; g.lineWidth = 1.5; g.beginPath();
 ys.forEach((v, i) => i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))); g.stroke();
 g.fillStyle = '#e2e8f0'; g.textAlign = 'right'; g.fillText(money(fim), w - 8, 14);
}
function chartBars(cv, labels, vals, title) {
 const [g, w, h] = cfit(cv); g.fillStyle = '#94a3b8'; g.fillText(title, 8, 14);
 if (!vals.length) { g.fillText('sem dados', 8, h / 2); return; }
 const mn = Math.min(0, ...vals), mx = Math.max(0, ...vals), Y = v => h - 18 - (v - mn) / ((mx - mn) || 1) * (h - 44), bw = Math.min(40, (w - 20) / vals.length * 0.7), step = Math.ceil(vals.length / 10);
 g.strokeStyle = '#334155'; g.beginPath(); g.moveTo(0, Y(0)); g.lineTo(w, Y(0)); g.stroke();
 vals.forEach((v, i) => {
  const x = 10 + (i + .5) * (w - 20) / vals.length; g.fillStyle = v >= 0 ? '#14b8a6' : '#f43f5e';
  g.fillRect(x - bw / 2, Math.min(Y(0), Y(v)), bw, Math.max(1, Math.abs(Y(v) - Y(0))));
  if (i % step === 0) { g.fillStyle = '#64748b'; g.textAlign = 'center'; g.fillText(labels[i], x, h - 4); g.textAlign = 'left'; }
 });
}
function openHist() {
 const el = qwin('hist', 'Relatório de Performance', 920, 700, `
  <div class="dk-row" style="align-items:center"><select id="hDays"><option value="1">Hoje</option><option value="7" selected>7 dias</option><option value="30">30 dias</option><option value="90">90 dias</option></select>
   <select id="hAcc"><option value="Simulação">Simulação</option><option value="MT5">Conta MT5</option></select>
   <select id="hFil"><option value="">Todas as origens</option><option value="Manual">Manual</option><option value="Auto">Automações</option></select>
   <button class="dk-btn g" id="hRef">Atualizar</button></div>
  <div id="hSum" style="margin-bottom:8px"></div>
  <div style="display:flex;gap:10px;margin-bottom:8px"><canvas id="hEq" class="hc"></canvas><canvas id="hDay" class="hc"></canvas></div>
  <table class="dk"><thead><tr><th>Hora</th><th>Ativo</th><th>Lado</th><th>Qtd</th><th>Entrada</th><th>Saída</th><th>Resultado</th><th>Origem</th><th>Motivo</th></tr></thead><tbody id="hTb"></tbody></table>`);
 if (!el) return;
 $('hAcc').value = mode === 'real' ? 'MT5' : 'Simulação';
 $('hDays').onchange = () => { reqReport(); renderHist(); }; $('hAcc').onchange = $('hFil').onchange = renderHist; $('hRef').onclick = reqReport;
 reqReport(); renderHist();
}
function renderHist() {
 if (!$('hTb')) return;
 const days = +$('hDays').value, acc = $('hAcc').value, f = $('hFil').value;
 const since = new Date(); since.setHours(0, 0, 0, 0); since.setDate(since.getDate() - (days - 1));
 let src = REPORT || [...TRADES.map(r => ({...r, mode: 'Simulação'})), ...DEALS];
 src = src.filter(r => r.mode === acc && r.t >= since.getTime() && (!f || (f === 'Auto' ? r.origin.startsWith('Auto') : !r.origin.startsWith('Auto')))).sort((a, b) => a.t - b.t);
 const pn = src.map(r => r.pnl), sum = a => a.reduce((x, y) => x + y, 0), wins = pn.filter(v => v > 0), loss = pn.filter(v => v < 0), tot = sum(pn);
 let eq = 0, pk = 0, dd = 0; const curve = pn.map(v => { eq += v; pk = Math.max(pk, eq); dd = Math.min(dd, eq - pk); return eq; });
 const byDay = {}; src.forEach(r => { const k = dayKey(r.t); byDay[k] = (byDay[k] || 0) + r.pnl; });
 const dk = Object.keys(byDay).sort(), c = v => `<b class="${v >= 0 ? 'up' : 'dn'}">${money(v)}</b>`;
 const man = sum(src.filter(r => !r.origin.startsWith('Auto')).map(r => r.pnl)), aut = sum(src.filter(r => r.origin.startsWith('Auto')).map(r => r.pnl));
 const pf = loss.length ? (sum(wins) / Math.abs(sum(loss))).toFixed(2) : '–';
 $('hSum').innerHTML = [['Operações', src.length], ['Acerto', src.length ? Math.round(wins.length / src.length * 100) + '%' : '–'], ['Resultado', c(tot)], ['Média/op', c(src.length ? tot / src.length : 0)],
  ['Maior ganho', c(Math.max(0, ...pn))], ['Maior perda', c(Math.min(0, ...pn))], ['Fator de lucro', pf], ['Drawdown máx', c(dd)], ['Manual', c(man)], ['Automação', c(aut)]]
  .map(([k, v]) => `<span class="kpi"><small>${k}</small>${v}</span>`).join('');
 chartLine($('hEq'), curve, 'Curva de capital (acumulado)'); chartBars($('hDay'), dk.map(k => k.slice(5)), dk.map(k => byDay[k]), 'Resultado por dia');
 $('hTb').innerHTML = src.slice().reverse().slice(0, 200).map(r => `<tr><td>${new Date(r.t).toLocaleString('pt-BR')}</td><td>${r.sym}</td>
  <td class="${r.side === 'C' ? 'up' : 'dn'}">${r.side === 'C' ? 'Compra' : 'Venda'}</td><td>${r.qty}</td><td>${fp(r.sym, r.entry)}</td><td>${fp(r.sym, r.exit)}</td>
  <td class="${r.pnl >= 0 ? 'up' : 'dn'}">${money(r.pnl)}</td><td>${r.origin}</td><td>${r.reason || ''}</td></tr>`).join('');
}

// ================= automações =================
function openAuto() {
 const el = qwin('auto', 'Estratégias de Negociação (Automações)', 980, 560, `
  <table class="dk"><thead><tr><th>#</th><th>Automação</th><th>Ativo</th><th>TF / Lote</th><th>Res. aberto</th><th>Res. dia</th><th>Posição</th><th>Estado</th><th>Último</th><th></th></tr></thead><tbody id="aTb"></tbody></table>
  <h4 style="margin:12px 0 6px;color:#e2e8f0">+ Nova automação</h4>
  <div class="dk-row">
   <div class="dk-f" style="width:150px"><label>Estratégia</label><select id="aStr" style="width:100%"></select></div><div id="aPar" class="dk-row" style="margin:0"></div>
   <div class="dk-f"><label>Ativo</label><input id="aSym"></div>
   <div class="dk-f" style="width:60px"><label>TF (min)</label><input id="aTf" value="1"></div>
   <div class="dk-f" style="width:60px"><label>Lote</label><input id="aLot" value="0.01"></div>
   <div class="dk-f" style="width:70px"><label>Stop (pts)</label><input id="aSl" value="0"></div>
   <div class="dk-f" style="width:70px"><label>Alvo (pts)</label><input id="aTp" value="0"></div>
   <div class="dk-f" style="width:70px"><label>Parcial (pts)</label><input id="aPa" value="0"></div>
   <div class="dk-f" style="width:70px"><label>% parcial</label><input id="aFr" value="0.5"></div>
  </div>
  <div class="dk-row">
   <div class="dk-f" style="width:72px"><label>Máx ops/dia</label><input id="aMt" value="5"></div>
   <div class="dk-f" style="width:84px"><label>Perda máx/dia</label><input id="aMl" value="0"></div>
   <div class="dk-f" style="width:84px"><label>Meta/dia</label><input id="aMe" value="0"></div>
   <div class="dk-f" style="width:84px"><label>Início</label><input id="aIni" type="time" value="09:05"></div>
   <div class="dk-f" style="width:84px"><label>Fim entradas</label><input id="aFim" type="time" value="17:00"></div>
   <div class="dk-f" style="width:84px"><label>Zerar às</label><input id="aFlat" type="time" value="17:30"></div>
   <label><input type="checkbox" id="aRev" style="width:auto"> Reverter</label>
   <label class="simg"><input type="checkbox" id="aSim" checked><span>Modo Simulação (não envia ordens ao MT5)</span></label>
   <button class="dk-btn" id="aGo">▶ Iniciar</button><button class="dk-btn g" id="aPre" title="Preenche com os valores do seu config.json">Preset Fluxo Global</button>
  </div>
  <div id="aLog"></div>`);
 if (!el) return;
 if (act) $('aSym').value = act.sym;
 $('aStr').onchange = buildPar;
 $('aTb').onclick = e => { const b = e.target.closest('[data-id]'); if (b && ws && ws.readyState === 1) ws.send(JSON.stringify({action: 'auto_stop', id: +b.dataset.id})); };
 $('aPre').onclick = () => {
  if (STRATS.fluxo_global) { $('aStr').value = 'fluxo_global'; buildPar(); }
  const v = {aSym: 'US500', aTf: 1, aLot: 0.01, aSl: 150, aTp: 300, aPa: 80, aFr: 0.5, aMt: 2, aMl: 80, aMe: 150, aIni: '09:30', aFim: '17:30', aFlat: '17:35'};
  Object.keys(v).forEach(k => $(k).value = v[k]); $('aRev').checked = false;
 };
 $('aGo').onclick = () => {
  if (!ws || ws.readyState !== 1) return toast('Bridge desconectada');
  const g = id => $(id).value, n = id => parseFloat(String(g(id)).replace(',', '.')) || 0, params = {};
  $('aPar').querySelectorAll('input').forEach(i => params[i.dataset.k] = parseFloat(i.value));
  const sim = $('aSim').checked;
  const cfg = {strategy: g('aStr'), params, symbol: g('aSym').trim(), tf: n('aTf'), lot: n('aLot'), sl: n('aSl'), tp: n('aTp'), parcial: n('aPa'), frac: n('aFr'),
   max_trades: n('aMt'), max_loss: n('aMl'), meta: n('aMe'), start: g('aIni'), end: g('aFim'), flat: g('aFlat'), reverse: $('aRev').checked, sim};
  if (!cfg.symbol || !cfg.tf || !cfg.lot) return toast('Preencha ativo, tempo gráfico e lote');
  if (!sim && !ACCINFO.demo && !confirm('A conta MT5 é REAL. Executar a automação enviando ordens?')) return;
  ws.send(JSON.stringify({action: 'auto_start', cfg}));
 };
 buildStr(); renderAuto();
}
function buildStr() { if (!$('aStr')) return; $('aStr').innerHTML = Object.keys(STRATS).map(k => `<option>${k}</option>`).join(''); buildPar(); }
function buildPar() {
 const p = (STRATS[$('aStr').value] || {}).params || {};
 $('aPar').innerHTML = Object.keys(p).map(k => `<div class="dk-f" style="width:66px"><label>${k}</label><input data-k="${k}" value="${p[k]}"></div>`).join('');
}
function renderAuto() {
 if (!$('aTb')) return;
 const c = v => `<span class="${v >= 0 ? 'up' : 'dn'}">${money(v)}</span>`;
 $('aTb').innerHTML = AUTOS.map(a => `<tr><td>${a.id}</td><td>${a.strategy} ${a.sim ? '<span class="simtag">SIM</span>' : ''}</td><td>${a.symbol}</td><td>${a.tf}M · ${a.lot}</td><td>${c(a.open || 0)}</td><td>${c(a.day || 0)}</td><td>${a.pos || ''}</td><td>${a.state}</td><td>${a.last}</td><td><button class="dk-btn r" data-id="${a.id}">Parar</button></td></tr>`).join('') ||
  '<tr><td colspan="10" style="text-align:center;color:#64748b">Nenhuma automação ativa</td></tr>';
 const l = $('aLog'); l.textContent = ALOG.join('\n'); l.scrollTop = l.scrollHeight;
}

// ================= menu superior (estilo Profit) =================
const MENUS = [
 ['Gráfico', [['Novo gráfico…', () => openSearch('', true)], ['Fechar gráfico ativo', () => rmPane(act)],
  ['Centralizar no preço atual', () => act.el.querySelector('.to-front-btn').click()], ['Configurações do gráfico…', () => $('ctxSettings').click()],
  {h: 'Periodicidade'}, ...[1, 2, 5, 10, 15, 30, 60].map(m => [m + ' minuto' + (m > 1 ? 's' : ''), () => setTf(act, m)])]],
 ['Exibir', [{h: 'Painéis'}, ['Chart Trading (painel lateral)', () => { const s = $('side'); s.style.display = s.style.display === 'none' ? '' : 'none'; setTimeout(drawAll, 50); }],
  ['Posição…', () => openPos(), 'F8'], ['Relatório de Performance…', () => openHist()]]],
 ['Estudos', [{h: 'Indicadores'}, ['Indicadores…', () => openInd()],
  ['Remover todos os indicadores', () => { act.inds = []; drawAll(); iApplied(); }], ['Restaurar padrão (VWAP + MME 9/21)', () => { act.inds = defaultInds(); drawAll(); iApplied(); }]]],
 ['Ferramentas', [['Cursor', () => setActiveTool('cursor')], ['Mãozinha', () => setActiveTool('hand'), 'Ctrl'], ['Cruz', () => setActiveTool('cross')],
  ['Régua', () => setActiveTool('ruler')], ['Fibonacci', () => setActiveTool('fibo')]]],
 ['Opções', [['Configurações do gráfico…', () => $('ctxSettings').click()], ['Lotes rápidos…', () => $('ctxLots').click()],
  ['Confirmar ordens em conta real (liga/desliga)', () => { $('cf').checked = !$('cf').checked; toast('Confirmação: ' + ($('cf').checked ? 'ligada' : 'desligada')); }]]],
 ['Negociação', [{h: 'Boletas'}, ['Comprar a mercado', () => send(1), 'F5'], ['Vender a mercado', () => send(-1), 'F9'],
  {h: 'Gerenciamento'}, ['Posição…', () => openPos(), 'F8'], ['Zerar posição do ativo', () => zero()], ['Cancelar ordens do ativo', () => cancel()],
  ['Relatório de Performance…', () => openHist()], {h: 'Estratégias de Negociação'}, ['Automações…', () => openAuto()]]],
];
const bar = document.createElement('nav'); bar.id = 'menubar';
const dd = document.createElement('div'); dd.className = 'mdd'; document.body.appendChild(dd);
let openM = null;
function hideMenu() { dd.style.display = 'none'; bar.querySelectorAll('button').forEach(b => b.classList.remove('on')); openM = null; }
function showMenu(btn, items) {
 dd.innerHTML = '';
 items.forEach(it => { const d = document.createElement('div');
  if (it.h) { d.className = 'mh'; d.textContent = it.h; } else { d.innerHTML = `${it[0]}<span>${it[2] || ''}</span>`; d.onclick = () => { hideMenu(); it[1](); }; }
  dd.appendChild(d); });
 const r = btn.getBoundingClientRect(); dd.style.left = r.left + 'px'; dd.style.top = r.bottom + 'px'; dd.style.display = 'block';
 bar.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn)); openM = btn;
}
MENUS.forEach(([name, items]) => {
 const b = document.createElement('button'); b.textContent = name;
 b.onclick = e => { e.stopPropagation(); openM === b ? hideMenu() : showMenu(b, items); };
 b.onmouseenter = () => { if (openM && openM !== b) showMenu(b, items); };
 bar.appendChild(b);
});
bar.insertAdjacentHTML('beforeend', '<span id="mbAcc"></span>');
document.body.prepend(bar);
addEventListener('click', hideMenu);
addEventListener('keydown', e => {
 if (!act) return;
 if (e.key === 'F5') { e.preventDefault(); send(1); }
 else if (e.key === 'F9') { e.preventDefault(); send(-1); }
 else if (e.key === 'F8') { e.preventDefault(); openPos(); }
});
$('ctxIndicators').onclick = e => { e.stopPropagation(); $('ctxMenu').style.display = 'none'; openInd(); };
$('autoSaveBtn').onclick = () => { $('indicatorsModal').style.display = 'none'; openAuto(); };

// ================= conta e mensagens da bridge =================
function updAcc() {
 CUR = {BRL: 'R$'}[ACCINFO.currency] || ACCINFO.currency || 'R$';
 $('mbAcc').textContent = ACCINFO.equity != null ? `MT5 ${ACCINFO.demo ? 'DEMO' : 'REAL'}${ACCINFO.hedging ? ' (hedge)' : ''} · saldo ${money(ACCINFO.balance || 0)} · equity ${money(ACCINFO.equity || 0)}` : '';
 if (mode === 'real') { $('mb').textContent = 'MT5 ' + (ACCINFO.demo ? 'DEMO' : 'REAL'); $('mb').className = 'badge' + (ACCINFO.demo ? '' : ' real'); }
}
$('mode').addEventListener('change', () => setTimeout(() => { updAcc(); if ($('hAcc')) { $('hAcc').value = mode === 'real' ? 'MT5' : 'Simulação'; renderHist(); } renderPos(); }, 0));

const _cb = connectBridge;
connectBridge = function () {
 _cb(); if (!ws) return;
 const h = ws.onmessage;
 ws.onmessage = e => {
  let m; try { m = JSON.parse(e.data); } catch (x) { return h(e); }
  if (m.type === 'tick' && m.bid) BK[m.symbol.toUpperCase()] = {bid: m.bid, ask: m.ask};
  else if (m.type === 'account') { ACCINFO = m; updAcc(); return; }
  else if (m.type === 'deals') { DEALS = m.rows; return; }
  else if (m.type === 'report') { REPORT = m.rows; renderHist(); return; }
  else if (m.type === 'strategies') { STRATS = m.list; buildStr(); return; }
  else if (m.type === 'auto') { AUTOS = m.list; ALOG = m.log; renderAuto(); return; }
  h(e);
 };
};
const _sa = setAct; setAct = function (p) { _sa(p); iApplied(); };
const _ui = ui; let _ut = 0; ui = function () { _ui(); const n = Date.now(); if (n - _ut > 400) { _ut = n; renderPos(); } };

// ================= ordens / P&L (substituem as funções do app.js) =================
function fillPrice(s, dq) { const b = BK[s.toUpperCase()]; return b ? (dq > 0 ? b.ask : b.bid) : px[s]; }   // compra no ask, venda no bid

function fill(a, s, dq, price, origin, reason) {
 origin = origin || 'Manual';
 const P = a.pos[s] || (a.pos[s] = {q: 0, avg: 0}), pv = SYMS[s] ? SYMS[s].pv : 1, r = x => Math.round(x * 1e8) / 1e8;
 if (P.q === 0 || Math.sign(P.q) === Math.sign(dq)) {
  P.avg = (P.avg * Math.abs(P.q) + price * Math.abs(dq)) / (Math.abs(P.q) + Math.abs(dq)); P.q = r(P.q + dq);
 } else {
  const c = Math.min(Math.abs(P.q), Math.abs(dq)), pnl = (price - P.avg) * Math.sign(P.q) * c * pv - COST_LOT * c;   // custo por lote (ida+volta) descontado ao fechar
  if (a === ACC.sim) {
   const tr = {t: Date.now(), sym: s, side: P.q > 0 ? 'C' : 'V', qty: c, entry: P.avg, exit: price, pnl, origin, reason: reason || ''};
   TRADES.unshift(tr); renderHist();
   if (ws && ws.readyState === 1) { ws.send(JSON.stringify({action: 'log_trade', trade: tr})); setTimeout(reqReport, 600); }   // grava no banco/CSV da bridge
  }
  a.rl += pnl;
  const nq = r(P.q + dq);
  if (nq === 0 || Math.sign(nq) !== Math.sign(P.q)) P.avg = nq === 0 ? 0 : price;
  P.q = nq;
 }
 if (P.q === 0) delete a.pos[s];
}

function order(s, dq, price, origin) {
 origin = origin || 'Manual';
 if (mode === 'real') {
  if (!ws || ws.readyState !== 1) return toast('Bridge desconectada: ordem NÃO enviada');
  if ($('cf').checked && !ACCINFO.demo && !confirm(`ORDEM REAL\n${dq > 0 ? 'COMPRA' : 'VENDA'} ${Math.abs(dq)} ${s} ${price ? 'LIMITE @ ' + price : 'A MERCADO'}`)) return;
  ws.send(JSON.stringify({action: 'order', symbol: s, side: dq > 0 ? 'BUY' : 'SELL', qty: Math.abs(dq), type: price ? 'LIMIT' : 'MARKET', price: price || null, oco: OCO_PENDING || undefined}));
  return;
 }
 if (price) {
  const bk = BK[s.toUpperCase()], ask = bk ? bk.ask : px[s], bid = bk ? bk.bid : px[s];
  ACC.sim.ord.push({s, q: dq, p: price, origin, k: dq > 0 ? (price < ask ? 'L' : 'S') : (price > bid ? 'L' : 'S')});   // L = limite, S = stop
 } else fill(ACC.sim, s, dq, fillPrice(s, dq), origin);
 ui(); drawAll();
 toast('[Simulação] ordem executada localmente');
}

function cancel() {
 const s = act.sym;
 if (mode === 'real') { if (ws && ws.readyState === 1) ws.send(JSON.stringify({action: 'cancel', symbol: s})); }
 else { ACC.sim.ord = ACC.sim.ord.filter(o => o.s !== s); toast('Ordens simuladas canceladas'); }
 ui(); drawAll();
}
$('bCan').onclick = cancel;
