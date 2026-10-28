// ordens.js — ordens no gráfico estilo Profit (carregar DEPOIS do dock.js)
//  Shift = compra · Alt = venda: a ordem fica presa ao mouse e só é lançada no clique esquerdo.
//  Arrastar a linha da POSIÇÃO cria Stop/Gain (mostra os pontos). Arrastar uma ordem/stop/gain move o preço.
//  Lote: roda do mouse sobre a ordem (ou com Shift/Alt preso), botões − + da etiqueta. ✕ cancela/remove.
var REAL_ORD = [], REAL_OCO = {}, BRK = {}, OC = {mod: null, pane: null, mx: 0, my: 0, drag: null};

const yOf = (p, v) => p.vCh * (1 - (v - p.vLo) / (p.vHi - p.vLo));
const priceOf = (p, y) => p.vLo + (p.vHi - p.vLo) * (1 - y / p.vCh);
const tickOf = s => (SYMS[s] && SYMS[s].tk) || 0.01;
const decOf = s => (SYMS[s] && SYMS[s].d != null) ? SYMS[s].d : 2;
const snapP = (s, v) => +(Math.round(v / tickOf(s)) * tickOf(s)).toFixed(decOf(s));
const lotStep = s => (SYMS[s] && (SYMS[s].vs || SYMS[s].vm)) || 1;
const lotQty = () => parseFloat(String($('lot').value).replace(',', '.')) || 1;
const roundQ = v => +Number(v).toFixed(8);
const ptsTxt = (s, v) => (v >= 0 ? '+' : '') + (+v.toFixed(decOf(s)));
const quote = s => { const b = BK[s.toUpperCase()]; return b ? b : {bid: px[s], ask: px[s]}; };
function BR(s) { const a = ACC.sim; a.br = a.br || {}; return a.br[s] || (a.br[s] = {sl: null, tp: null}); }
const pvOf = s => (SYMS[s] ? SYMS[s].pv : 1);

// ---------- objetos do gráfico (posição, ordens pendentes, stop, gain) ----------
function chartObjs(s) {
 const out = [], P = A().pos[s];
 if (P && P.q) out.push({kind: 'pos', p: P.avg, q: P.q, ref: null});
 if (P && P.q && COST_LOT > 0 && pvOf(s) > 0) {   // ponto de cobertura: onde o resultado cobre o custo (ida+volta)
  const d = P.q > 0 ? 1 : -1, tk = tickOf(s), raw = P.avg + d * COST_LOT / pvOf(s);
  out.push({kind: 'be', p: +((d > 0 ? Math.ceil(raw / tk - 1e-9) : Math.floor(raw / tk + 1e-9)) * tk).toFixed(decOf(s)), q: P.q, ref: null});
 }
 if (mode === 'sim') {
  ACC.sim.ord.filter(o => o.s === s).forEach(o => out.push({kind: 'ord', ref: o, p: o.p, q: o.q, k: o.k || 'L'}));
  const b = ACC.sim.br && ACC.sim.br[s];
  if (b && P && P.q) {
   ['sl', 'tp'].forEach(k => { if (b[k]) out.push({kind: k, ref: b[k], p: b[k].p, q: b[k].q}); });
   (b.par || []).forEach(l => out.push({kind: 'par', ref: l, p: l.p, q: l.q, pct: b.q0 ? Math.round(l.q / b.q0 * 100) : null}));
  }
 } else {
  REAL_ORD.filter(o => o.sym === s).forEach(o => out.push({kind: 'ord', ref: o, p: o.price, q: o.side === 'BUY' ? o.qty : -o.qty, k: o.kind}));
  const b = BRK[s];
  if (b && P && P.q) ['sl', 'tp'].forEach(k => { if (b[k]) out.push({kind: k, ref: null, p: b[k], q: Math.abs(P.q)}); });
  if (P && P.q) (REAL_OCO[s] || []).forEach(l => out.push({kind: 'par', ref: null, ro: true, p: l.p, q: l.q, pct: l.pct}));
 }
 return out;
}
const nearObj = (p, y, tol) => chartObjs(p.sym).map(o => ({o, d: Math.abs(yOf(p, o.p) - y)})).filter(z => z.d <= tol && z.o.kind !== 'be')
 .sort((a, b) => (a.d - b.d) || ((a.o.kind === 'pos') - (b.o.kind === 'pos')))[0];

// ---------- desenho ----------
function drawTag(g, p, o, y, col, label) {
 g.font = 'bold 11px sans-serif';
 const sltp = o.kind === 'sl' || o.kind === 'tp', par = o.kind === 'par';
 const edit = !o.drag && !o.ro && (o.kind === 'ord' || ((sltp || par) && mode === 'sim'));
 const closable = !o.drag && !o.ro && (o.kind === 'ord' || sltp || (par && mode === 'sim'));
 const segs = [];
 if (edit) segs.push({t: '−', a: 'dec'}, {t: String(roundQ(Math.abs(o.q)))}, {t: '+', a: 'inc'});
 else if (o.kind !== 'pos' && o.kind !== 'be') segs.push({t: String(roundQ(Math.abs(o.q)))});
 segs.push({t: label});
 if (closable) segs.push({t: '✕', a: 'x'});
 segs.forEach(s => { s.w = g.measureText(s.t).width + (s.a ? 12 : 10); });
 const W = segs.reduce((n, s) => n + s.w, 0), H = 18; let cx = 8;
 g.fillStyle = col; g.fillRect(8, y - H / 2, W, H);
 segs.forEach(s => {
  if (s.a) { g.fillStyle = 'rgba(0,0,0,.30)'; g.fillRect(cx, y - H / 2, s.w, H); p.hits.push({x: cx, y, w: s.w, h: H, a: s.a, obj: o}); }
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(s.t, cx + s.w / 2, y); cx += s.w;
 });
 g.textAlign = 'left';
}
function drawObj(g, p, o, pr) {
 const s = p.sym, price = pr != null ? pr : o.p, E = A().pos[s], q = Math.abs(o.q);
 const y = Math.max(10, Math.min(p.vCh - 10, yOf(p, price)));
 const pts = E && E.q ? (price - E.avg) * (E.q > 0 ? 1 : -1) : 0;
 let col, label;
 if (o.kind === 'pos') { const pnl = (px[s] - o.p) * o.q * pvOf(s); col = pnl >= 0 ? '#0d9488' : '#e11d48'; label = `${o.q > 0 ? 'C' : 'V'} ${roundQ(q)} · ${money(pnl)}`; }
 else if (o.kind === 'be') { col = '#a78bfa'; label = `COBERTURA ${ptsTxt(s, pts)} pts · custo ${money(COST_LOT * q)}`; }
 else if (o.kind === 'ord') { col = o.q > 0 ? '#0369a1' : '#b45309'; label = `${o.q > 0 ? 'COMPRA' : 'VENDA'} ${o.k === 'S' ? 'STOP' : 'LIMITE'} @ ${fp(s, price)}`;
  if (o.drag) label += ` (${ptsTxt(s, price - o.orig)} pts)`; }
 else if (o.kind === 'par') { col = '#22c55e'; label = `PARCIAL ${ptsTxt(s, pts)} pts${o.pct != null ? ' · ' + o.pct + '%' : ''} · ${money(pts * q * pvOf(s))}`; }
 else { col = o.kind === 'sl' ? '#dc2626' : '#16a34a'; label = `${o.kind === 'sl' ? 'STOP' : 'GAIN'} ${ptsTxt(s, pts)} pts · ${money(pts * q * pvOf(s))}`; }
 g.strokeStyle = col; g.lineWidth = o.kind === 'pos' ? 1.5 : 1.2; g.setLineDash(o.kind === 'pos' ? [] : o.kind === 'be' ? [2, 3] : [6, 3]);
 g.beginPath(); g.moveTo(0, y); g.lineTo(p.vCw, y); g.stroke(); g.setLineDash([]);
 tag(g, p.vCw, y, fp(s, price), col);
 drawTag(g, p, o, y, col, label);
}
function legKind(s, price) { const E = A().pos[s]; return (E.q > 0 ? price < E.avg : price > E.avg) ? 'sl' : 'tp'; }
function drawGhost(g, p) {
 const s = p.sym, price = snapP(s, priceOf(p, OC.my)), buy = OC.mod === 'buy', q = lotQty(), bk = quote(s), mk = px[s];
 const kind = Math.abs(price - mk) < tickOf(s) ? 'A MERCADO' : buy ? (price < bk.ask ? 'LIMITE' : 'STOP') : (price > bk.bid ? 'LIMITE' : 'STOP');
 const col = buy ? '#0ea5e9' : '#f59e0b', y = Math.max(10, Math.min(p.vCh - 10, OC.my));
 g.strokeStyle = col; g.lineWidth = 1.5; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(0, y); g.lineTo(p.vCw, y); g.stroke(); g.setLineDash([]);
 tag(g, p.vCw, y, fp(s, price), col);
 drawTag(g, p, {kind: 'ghost', q, drag: true}, y, col, `${buy ? 'COMPRA' : 'VENDA'} ${kind} @ ${fp(s, price)} (${ptsTxt(s, price - mk)} pts) · clique p/ lançar`);
}
function legKindMove(s, price, kind) {       // stop continua stop (e alvo continua alvo) enquanto não cruzar o preço atual
 const E = A().pos[s], q = quote(s), long = E.q > 0, ref = long ? q.bid : q.ask;
 if (kind === 'sl') return (long ? price < ref : price > ref) ? 'sl' : 'tp';
 return (long ? price > ref : price < ref) ? 'tp' : 'sl';
}
function overlay(p) {
 if (!p.vCh || !p.vHi || p.vHi === p.vLo) return;
 const g = p.cv.getContext('2d'), d = OC.drag && OC.drag.pane === p ? OC.drag : null;
 p.hits = []; g.save(); g.textBaseline = 'middle'; g.textAlign = 'left';
 chartObjs(p.sym).forEach(o => { if (d && d.mode === 'move' && o.kind === d.obj.kind && o.ref === d.obj.ref) return; drawObj(g, p, o); });
 if (d) {
  const E = A().pos[p.sym];
  if (d.mode === 'new') drawObj(g, p, {kind: legKind(p.sym, d.price), p: d.price, q: Math.abs(E.q), drag: true}, d.price);
  else { const o = d.obj, kind = (o.kind === 'sl' || o.kind === 'tp') ? legKindMove(p.sym, d.price, o.kind) : o.kind; drawObj(g, p, {...o, kind, drag: true, orig: o.p}, d.price); }
 } else if (OC.pane === p && OC.mod && OC.mx < p.vCw) drawGhost(g, p);
 g.restore();
}
const _draw0 = draw;
draw = function (p) { _draw0(p); try { overlay(p); } catch (e) { console.error('overlay', e); } };

// ---------- ações ----------
function setRealSltp(s, sl, tp) {
 if (!ws || ws.readyState !== 1) return toast('Bridge desconectada');
 BRK[s] = {sl, tp}; ws.send(JSON.stringify({action: 'set_sltp', symbol: s, sl, tp}));
}
function setLeg(s, price, kindFrom) {
 const E = A().pos[s]; if (!E || !E.q) return;
 const kind = kindFrom ? legKindMove(s, price, kindFrom) : legKind(s, price);
 if (mode === 'sim') { const b = BR(s), q = kindFrom && b[kindFrom] ? b[kindFrom].q : Math.abs(E.q); if (kindFrom && kindFrom !== kind) b[kindFrom] = null; b[kind] = {p: price, q}; }
 else { const c = BRK[s] || {sl: 0, tp: 0}, n = {sl: c.sl || 0, tp: c.tp || 0}; if (kindFrom && kindFrom !== kind) n[kindFrom] = 0; n[kind] = price; setRealSltp(s, n.sl, n.tp); }
}
function moveOrder(s, o, price) {
 if (mode === 'sim') { const q = quote(s), r = o.ref; r.p = price; r.k = r.q > 0 ? (price < q.ask ? 'L' : 'S') : (price > q.bid ? 'L' : 'S'); }
 else if (ws && ws.readyState === 1) { o.ref.price = price; ws.send(JSON.stringify({action: 'modify_order', ticket: o.ref.ticket, price, qty: Math.abs(o.q)})); }
}
let _mq = {};
function changeQty(s, o, delta) {
 const nq = Math.max(lotStep(s), roundQ(Math.abs(o.q) + delta));
 if (o.kind === 'ord') {
  if (mode === 'sim') o.ref.q = (o.q > 0 ? 1 : -1) * nq;
  else { o.ref.qty = nq; clearTimeout(_mq[o.ref.ticket]);
   _mq[o.ref.ticket] = setTimeout(() => ws && ws.readyState === 1 && ws.send(JSON.stringify({action: 'modify_order', ticket: o.ref.ticket, price: o.ref.price, qty: nq})), 500); }
 } else if (mode === 'sim') o.ref.q = Math.min(nq, Math.abs(A().pos[s].q));
 else return toast('Na conta MT5 o stop/gain vale para a posição inteira');
 drawAll();
}
function removeObj(s, o) {
 if (o.kind === 'ord') { if (mode === 'sim') ACC.sim.ord = ACC.sim.ord.filter(x => x !== o.ref); else if (ws && ws.readyState === 1) ws.send(JSON.stringify({action: 'cancel_order', ticket: o.ref.ticket})); }
 else if (o.kind === 'par') { if (mode === 'sim') { const b = BR(s); b.par = (b.par || []).filter(x => x !== o.ref); } }
 else if (mode === 'sim') BR(s)[o.kind] = null;
 else { const c = BRK[s] || {sl: 0, tp: 0}; setRealSltp(s, o.kind === 'sl' ? 0 : c.sl, o.kind === 'tp' ? 0 : c.tp); }
 drawAll();
}
function placeGhost(p) {
 const s = p.sym, price = snapP(s, priceOf(p, OC.my)), buy = OC.mod === 'buy', q = lotQty();
 order(s, buy ? q : -q, Math.abs(price - px[s]) < tickOf(s) ? null : price);
}
function finishDrag(d) {
 const p = d.pane, s = p.sym, o = d.obj;
 if (Math.abs(d.price - o.p) < tickOf(s) / 2) return;
 if (d.mode === 'new') setLeg(s, d.price, null);
 else if (o.kind === 'ord') moveOrder(s, o, d.price);
 else if (o.kind === 'par') {
  const E = A().pos[s];
  if (o.ro) return toast('Parcial da conta MT5: remova a OCO e crie de novo');
  if (E.q > 0 ? d.price <= E.avg : d.price >= E.avg) return toast('A parcial precisa ficar no lado do lucro');
  o.ref.p = d.price;
 } else setLeg(s, d.price, o.kind);
}

// ---------- mouse e teclado (captura: roda antes dos handlers do app.js) ----------
const paneAt = e => panes.find(p => p.cv === e.target);
const rel = (p, e) => { const r = p.cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
const stopEv = e => { e.stopImmediatePropagation(); e.preventDefault(); };
const hitAt = (p, x, y) => (p.hits || []).find(h => x >= h.x && x <= h.x + h.w && Math.abs(y - h.y) <= h.h / 2);

addEventListener('mousemove', e => {
 OC.mod = e.shiftKey ? 'buy' : e.altKey ? 'sell' : null;
 const p = paneAt(e);
 if (p && p.vCh) { [OC.mx, OC.my] = rel(p, e); OC.pane = p; } else if (!OC.drag) OC.pane = null;
 if (OC.drag) {
  const d = OC.drag, [, y] = rel(d.pane, e);
  d.price = snapP(d.pane.sym, priceOf(d.pane, Math.max(0, Math.min(d.pane.vCh, y)))); stopEv(e); draw(d.pane); return;
 }
 if (p && p.vCh) {
  const base = activeTool === 'hand' ? 'grab' : activeTool === 'cross' ? 'crosshair' : 'default';
  p.cv.style.cursor = OC.mod ? 'crosshair' : hitAt(p, OC.mx, OC.my) ? 'pointer' : (OC.mx < p.vCw && nearObj(p, OC.my, 5)) ? 'ns-resize' : base;
 }
}, true);

addEventListener('mousedown', e => {
 if (e.button !== 0) return;
 const p = paneAt(e); if (!p || !p.vCh) return;
 const [x, y] = rel(p, e); if (x >= p.vCw) return;
 OC.mx = x; OC.my = y; OC.pane = p; OC.mod = e.shiftKey ? 'buy' : e.altKey ? 'sell' : null;
 const h = hitAt(p, x, y);
 if (h) { stopEv(e); setAct(p);
  if (h.a === 'x') removeObj(p.sym, h.obj); else changeQty(p.sym, h.obj, (h.a === 'inc' ? 1 : -1) * lotStep(p.sym)); return; }
 if (OC.mod) { stopEv(e); setAct(p); placeGhost(p); return; }
 const z = nearObj(p, y, 5); if (!z) return;
 const o = z.o, b = A().pos[p.sym] && mode === 'sim' ? BR(p.sym) : (BRK[p.sym] || {});
 if (o.kind === 'pos' && (mode === 'sim' ? (b.sl && b.tp) : (b.sl && b.tp))) return;   // já tem stop e gain
 stopEv(e); setAct(p); OC.drag = {pane: p, obj: o, mode: o.kind === 'pos' ? 'new' : 'move', price: o.p};
}, true);

addEventListener('mouseup', e => {
 if (!OC.drag) return;
 const d = OC.drag; OC.drag = null; stopEv(e); finishDrag(d); drawAll();
}, true);

addEventListener('wheel', e => {
 const p = paneAt(e); if (!p || !p.vCh) return;
 const [x, y] = rel(p, e); if (x >= p.vCw) return;
 const dir = (e.deltaY || e.deltaX) < 0 ? 1 : -1;
 if (e.shiftKey || e.altKey) {                       // ordem presa ao mouse: ajusta o lote do painel
  stopEv(e); const q = Math.max(lotStep(p.sym), roundQ(lotQty() + dir * lotStep(p.sym))); $('lot').value = q; draw(p); return; }
 const z = nearObj(p, y, 6);
 if (z && z.o.kind !== 'pos') { stopEv(e); changeQty(p.sym, z.o, dir * lotStep(p.sym)); }
}, {capture: true, passive: false});

function modKeys(e) { OC.mod = e.shiftKey ? 'buy' : e.altKey ? 'sell' : null; if (OC.pane) draw(OC.pane); }
addEventListener('keydown', e => {
 if (e.key === 'Alt') e.preventDefault();
 if (e.key === 'Escape' && OC.drag) { OC.drag = null; drawAll(); return; }
 if (e.key === 'Shift' || e.key === 'Alt') modKeys(e);
}, true);
addEventListener('keyup', e => { if (e.key === 'Shift' || e.key === 'Alt') modKeys(e); }, true);
addEventListener('blur', () => { OC.mod = null; OC.drag = null; drawAll(); });

// ---------- simulação: ordens pendentes (limite/stop) e stop/gain ----------
function simBrackets(s) {
 const a = ACC.sim, b = a.br && a.br[s];
 if (!a.pos[s] || !a.pos[s].q) { if (a.br) delete a.br[s]; return; }
 if (!b) return;
 const legs = [['sl', b.sl, 'stop'], ['tp', b.tp, 'gain'], ...(b.par || []).map(l => ['par', l, 'parcial'])];
 for (const [k, L, motivo] of legs) {
  const P2 = a.pos[s]; if (!L || !P2) continue;
  const long = P2.q > 0, qt = quote(s), price = long ? qt.bid : qt.ask;
  const hit = k === 'sl' ? (long ? price <= L.p : price >= L.p) : (long ? price >= L.p : price <= L.p);
  if (!hit) continue;
  const q = Math.min(L.q, Math.abs(P2.q));
  fill(a, s, long ? -q : q, price, 'Manual', motivo);
  if (k === 'par') b.par = b.par.filter(x => x !== L); else b[k] = null;
  toast(`[Simulação] ${motivo.toUpperCase()} executado em ${s} @ ${fp(s, price)}`);
 }
 const P3 = a.pos[s];
 if (!P3) { delete a.br[s]; return; }                 // posição zerada: OCO cancela as demais pernas
 const rem = Math.abs(P3.q);
 ['sl', 'tp'].forEach(k => { if (b[k]) b[k].q = b.oco ? rem : Math.min(b[k].q, rem); });
 (b.par || []).forEach(l => { l.q = Math.min(l.q, rem); });
}
function feedTick(sym, price, tTime) {
 panes.forEach(p => {
  if (p.sym.toUpperCase() !== sym.toUpperCase()) return;
  if (!p.cs || p.cs.length === 0) return;
  const l = p.cs[p.cs.length - 1], per = p.tf * 60 * 1000, candleTime = Math.floor(tTime / per) * per;
  if (candleTime > l.t) { p.cs.push({t: candleTime, o: l.c, h: Math.max(l.c, price), l: Math.min(l.c, price), c: price}); if (p.cs.length > 1500) p.cs.shift(); }
  else { l.c = price; l.h = Math.max(l.h, price); l.l = Math.min(l.l, price); }
 });
 const a = ACC.sim;
 a.ord = a.ord.filter(o => {
  const q = quote(o.s), buy = o.q > 0, k = o.k || 'L', pr = buy ? q.ask : q.bid;
  if (!pr) return true;
  const hit = buy ? (k === 'L' ? pr <= o.p : pr >= o.p) : (k === 'L' ? pr >= o.p : pr <= o.p);
  if (!hit) return true;
  fill(a, o.s, o.q, k === 'S' ? pr : o.p, o.origin);       // limite executa no preço da ordem; stop no preço de mercado
  const P = a.pos[o.s]; if (o.oco && P && Math.sign(P.q) === Math.sign(o.q)) applyOco(o.s, o.oco);
  toast(`[Simulação] ${k === 'S' ? 'Stop' : 'Limite'} executada: ${buy ? 'C' : 'V'} ${Math.abs(o.q)} ${o.s} @ ${fp(o.s, k === 'S' ? pr : o.p)}`);
  return false;
 });
 for (const s in (a.br || {})) simBrackets(s);
 drawAll(); ui();
}

// ---------- mensagens da bridge: ordens pendentes e stop/gain da conta MT5 ----------
const _cb2 = connectBridge;
connectBridge = function () {
 _cb2(); if (!ws) return;
 const h = ws.onmessage;
 ws.onmessage = e => {
  let m; try { m = JSON.parse(e.data); } catch (x) { return h(e); }
  if (m.type === 'orders') { REAL_ORD = m.list; if (mode === 'real') drawAll(); return; }
  if (m.type === 'oco') { REAL_OCO = m.list; if (mode === 'real') drawAll(); return; }
  if (m.type === 'position') { BRK[m.symbol] = {sl: m.sl || 0, tp: m.tp || 0}; }
  h(e);
 };
};


// ---------- Chart Trading: OCO (stop + alvo + parciais) e ponto de cobertura ----------
(function () {
 const st = document.createElement('style');
 st.textContent = `.oco{background:#030712;border:1px solid #1f2937;border-radius:4px;padding:8px;display:flex;flex-direction:column;gap:6px;font-size:11px}
.oco label{display:flex;align-items:center;gap:6px;color:#e5e7eb;font-weight:700;margin:0}.oco input[type=number]{width:100%;background:#1f2937;border:1px solid #374151;color:#f3f4f6;padding:3px 5px;border-radius:3px;font-size:11px;user-select:text}
.oco .r2{display:grid;grid-template-columns:1fr 1fr;gap:5px}.oco .pr{display:grid;grid-template-columns:1fr 1fr 24px;gap:4px;align-items:center;margin-bottom:3px}
.oco small{color:#64748b}.oco button{background:#374151;color:#fff;border:0;border-radius:3px;padding:4px;font-weight:700;cursor:pointer}.oco .x{background:#7f1d1d}
#ctip{position:fixed;z-index:400;pointer-events:none;background:rgba(15,23,42,.96);border:1px solid #3b82f6;border-radius:6px;padding:7px 10px;font-size:11px;color:#e2e8f0;display:none;line-height:1.6;box-shadow:0 8px 20px rgba(0,0,0,.5)}
#ctip b{color:#94a3b8;font-weight:600;display:inline-block;width:72px}`;
 document.head.appendChild(st);
})();
let OCO_PARTS = [];
const ocoBox = document.createElement('div'); ocoBox.className = 'oco';
ocoBox.innerHTML = `<label><input type="checkbox" id="ocoOn"> Ordem OCO (stop + alvo + parciais)</label>
 <div id="ocoBody" style="display:none;flex-direction:column;gap:6px">
  <div class="r2"><div><small>Stop (pts)</small><input type="number" id="ocoSl" step="any" value="0"></div><div><small>Alvo final (pts)</small><input type="number" id="ocoTp" step="any" value="0"></div></div>
  <small>Parciais: pontos do alvo · % do lote da entrada</small><div id="ocoParts"></div><button id="ocoAdd">+ parcial</button><small id="ocoSum"></small>
 </div>
 <div class="r2"><div><small>Custo/lote (ida+volta)</small><input type="number" id="costLot" step="any" value="0"></div><div style="display:flex;align-items:flex-end"><button id="beBtn" style="width:100%">Stop → cobertura</button></div></div>`;
$('bZC').after(ocoBox);
function ocoSum() { const t = OCO_PARTS.reduce((n, r) => n + (+r.pct || 0), 0); $('ocoSum').textContent = OCO_PARTS.length ? `Parciais somam ${t}% · o restante sai no alvo ou no stop` : ''; }
function ocoRender() {
 $('ocoParts').innerHTML = OCO_PARTS.map((r, i) => `<div class="pr"><input type="number" step="any" data-i="${i}" data-f="pts" value="${r.pts}" placeholder="pts"><input type="number" step="any" data-i="${i}" data-f="pct" value="${r.pct}" placeholder="%"><button class="x" data-x="${i}">✕</button></div>`).join('');
 $('ocoBody').style.display = $('ocoOn').checked ? 'flex' : 'none'; ocoSum();
}
function ocoSave() { try { localStorage.setItem('quantum_oco', JSON.stringify({on: $('ocoOn').checked, sl: $('ocoSl').value, tp: $('ocoTp').value, parts: OCO_PARTS, cost: $('costLot').value})); } catch (e) {} }
(function () { try { const c = JSON.parse(localStorage.getItem('quantum_oco') || 'null'); if (c) { $('ocoOn').checked = !!c.on; $('ocoSl').value = c.sl; $('ocoTp').value = c.tp; OCO_PARTS = c.parts || []; $('costLot').value = c.cost; COST_LOT = parseFloat(c.cost) || 0; } } catch (e) {} ocoRender(); })();
ocoBox.addEventListener('input', e => {
 const t = e.target; if (t.dataset && t.dataset.i != null) OCO_PARTS[+t.dataset.i][t.dataset.f] = parseFloat(t.value) || 0;
 COST_LOT = parseFloat($('costLot').value) || 0; ocoSum(); ocoSave(); drawAll();
});
ocoBox.addEventListener('change', e => { if (e.target.id === 'ocoOn') { ocoRender(); ocoSave(); } });
ocoBox.addEventListener('click', e => {
 const t = e.target;
 if (t.id === 'ocoAdd') { OCO_PARTS.push({pts: 0, pct: 25}); ocoRender(); ocoSave(); }
 else if (t.dataset && t.dataset.x != null) { OCO_PARTS.splice(+t.dataset.x, 1); ocoRender(); ocoSave(); }
 else if (t.id === 'beBtn') toBreakeven();
});
function ocoCfg() {
 if (!$('ocoOn').checked) return null;
 const sl = parseFloat($('ocoSl').value) || 0, tp = parseFloat($('ocoTp').value) || 0;
 const parts = OCO_PARTS.map(r => ({pts: +r.pts || 0, pct: +r.pct || 0})).filter(r => r.pts > 0 && r.pct > 0);
 if (!sl && !tp && !parts.length) return null;
 if (parts.reduce((n, r) => n + r.pct, 0) > 100) { toast('As parciais passam de 100%'); return false; }
 return {sl, tp, parts};
}
function applyOco(s, cfg) {                  // simulação: monta stop + alvo + parciais a partir do preço médio
 const P = ACC.sim.pos[s]; if (!P || !P.q) return;
 const d = P.q > 0 ? 1 : -1, qty = Math.abs(P.q), step = lotStep(s), b = BR(s);
 b.oco = true; b.q0 = qty; b.par = [];
 b.sl = cfg.sl > 0 ? {p: snapP(s, P.avg - d * cfg.sl), q: qty} : null;
 b.tp = cfg.tp > 0 ? {p: snapP(s, P.avg + d * cfg.tp), q: qty} : null;
 let used = 0;
 cfg.parts.forEach(pt => {
  const q = roundQ(Math.floor(qty * pt.pct / 100 / step + 1e-9) * step);
  if (q >= step && used + q < qty - 1e-9) { b.par.push({p: snapP(s, P.avg + d * pt.pts), q}); used = roundQ(used + q); }
  else toast(`Parcial de ${pt.pts} pts ignorada: lote pequeno demais para dividir`);
 });
}
const _order1 = order;
order = function (s, dq, price, origin) {
 origin = origin || 'Manual';
 const P = A().pos[s], opens = !P || !P.q || Math.sign(P.q) === Math.sign(dq);
 const cfg = origin === 'Manual' && opens ? ocoCfg() : null;
 if (cfg === false) return;
 if (mode === 'real') { OCO_PENDING = cfg; try { _order1(s, dq, price, origin); } finally { OCO_PENDING = null; } return; }
 const n0 = ACC.sim.ord.length; _order1(s, dq, price, origin);
 if (!cfg) return;
 if (price) { if (ACC.sim.ord.length > n0) ACC.sim.ord[ACC.sim.ord.length - 1].oco = cfg; }
 else applyOco(s, cfg);
 drawAll();
};
function toBreakeven() {
 const s = act.sym, P = A().pos[s];
 if (!P || !P.q) return toast('Sem posição aberta');
 const be = chartObjs(s).find(o => o.kind === 'be'), price = be ? be.p : P.avg, long = P.q > 0, q = quote(s);
 if (long ? price >= q.bid : price <= q.ask) return toast('O preço ainda não passou da cobertura');
 if (mode === 'sim') BR(s).sl = {p: price, q: Math.abs(P.q)};
 else setRealSltp(s, price, (BRK[s] || {}).tp || 0);
 drawAll(); toast(`Stop movido para a cobertura @ ${fp(s, price)}`);
}

// ---------- informações do candle ao parar o mouse ----------
const tip = document.createElement('div'); tip.id = 'ctip'; document.body.appendChild(tip);
let _tt = null;
function hideTip() { clearTimeout(_tt); tip.style.display = 'none'; }
function showTip(p, x, y, cx, cy) {
 const n = Math.floor(p.vCw / p.z), e = p.cs.length - p.off, s0 = Math.max(0, e - n), idx = s0 + Math.floor(x / p.z), c = p.cs[idx];
 if (!c || idx >= e || y < yOf(p, c.h) - 4 || y > yOf(p, c.l) + 4) return;
 const f = v => fp(p.sym, v), d = c.c - c.o, pct = c.o ? d / c.o * 100 : 0, dt = new Date(c.t);
 tip.innerHTML = `<div><b>${dt.toLocaleDateString('pt-BR')}</b>${dt.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})} · ${p.tf}M</div>
  <div><b>Abertura</b>${f(c.o)}</div><div><b>Máxima</b>${f(c.h)}</div><div><b>Mínima</b>${f(c.l)}</div><div><b>Fechamento</b>${f(c.c)}</div>
  <div><b>Variação</b><span class="${d >= 0 ? 'up' : 'dn'}">${ptsTxt(p.sym, d)} pts (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)</span></div>${c.v ? `<div><b>Volume</b>${Math.round(c.v)}</div>` : ''}`;
 tip.style.display = 'block';
 tip.style.left = Math.min(cx + 16, innerWidth - tip.offsetWidth - 8) + 'px'; tip.style.top = Math.min(cy + 16, innerHeight - tip.offsetHeight - 8) + 'px';
}
addEventListener('mousemove', e => {
 hideTip(); const p = paneAt(e);
 if (!p || !p.vCh || OC.drag || OC.mod || p.isMouseDown) return;
 const [x, y] = rel(p, e); if (x >= p.vCw || hitAt(p, x, y) || nearObj(p, y, 5)) return;
 _tt = setTimeout(() => showTip(p, x, y, e.clientX, e.clientY), 350);
}, true);
['mousedown', 'wheel', 'keydown'].forEach(t => addEventListener(t, hideTip, true));
document.addEventListener('mouseleave', hideTip);
