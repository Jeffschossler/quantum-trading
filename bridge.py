"""Bridge Quantum <-> MetaTrader 5 (ordens, posições, histórico, automações).
Também roda sozinha, sem a tela:  python bridge.py"""
import asyncio, json, logging, time
from datetime import datetime, timedelta
import MetaTrader5 as mt5
import websockets
import automation as au
import store
import oco

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
SERVER_UTC_OFFSET_H = None        # None = detecta sozinho; ou fixe (ex.: 3 se o servidor está em UTC+3)
clients, last_tick, last_pos, last_deals, last_orders, last_oco = set(), {}, {}, [None], [None], [None]
ENGINE = au.Engine()

_watch = [0.0, []]
def watch_symbols():
    """Ativos da Observação de Mercado (a API do MT5 não tem filtro 'selected'; usamos .visible). Cache de 2 s."""
    if time.time() - _watch[0] > 2:
        _watch[0], _watch[1] = time.time(), [s for s in (mt5.symbols_get() or []) if s.visible]
    return _watch[1]

def ensure_mt5():
    if mt5.terminal_info() is None and not mt5.initialize():
        logging.error(f"Falha ao inicializar o MT5: {mt5.last_error()}"); return False
    if not ENGINE.loaded: refresh_offset(); ENGINE.load()
    return True

def refresh_offset():
    if SERVER_UTC_OFFSET_H is not None:
        au.SRV_OFF = int(SERVER_UTC_OFFSET_H * 3600)
    else:
        best = 0
        for s in watch_symbols()[:40]:
            t = mt5.symbol_info_tick(s.name)
            if t and t.time > best: best = t.time
        if best and abs(best - time.time()) < 15 * 3600:
            au.SRV_OFF = int(round((best - time.time()) / 1800) * 1800)
    logging.info(f"Offset do servidor MT5: {au.SRV_OFF / 3600:+.1f}h")

def mt5_error_now():
    return mt5.terminal_info() is None

def real_symbol(req):
    if mt5.symbol_info(req): return req
    for s in mt5.symbols_get() or []:
        if s.name.upper() == str(req).upper(): return s.name
    return req

async def send_all(obj):
    msg = json.dumps(obj)
    for ws in list(clients):
        try: await ws.send(msg)
        except Exception: clients.discard(ws)

def sym_info(s):
    tk = s.trade_tick_size or s.point or 0.01
    tv = s.trade_tick_value_profit or s.trade_tick_value
    return {"n": s.description or s.name, "b": s.bid or s.last or s.session_close or 1.0,
            "pv": tv / tk if tv and tk else (s.trade_contract_size or 1.0),   # R$ por 1 unidade de preço por lote
            "tk": tk, "d": s.digits, "vm": s.volume_min, "vs": s.volume_step}

def account_msg():
    a = mt5.account_info()
    return {"type": "account", "demo": au.is_demo(), "hedging": au.is_hedging(),
            "currency": a.currency if a else "", "balance": a.balance if a else 0, "equity": a.equity if a else 0}

def origin(magic):
    if magic == au.MAGIC_MANUAL: return "Manual"
    if au.MAGIC_AUTO < magic < au.MAGIC_AUTO + 100: return f"Auto #{magic - au.MAGIC_AUTO}"
    return "Manual" if magic == 0 else "Outro"

def all_positions():
    d = {}
    for p in mt5.positions_get() or []:
        v = p.volume if p.type == mt5.POSITION_TYPE_BUY else -p.volume
        q, c, vol, sl, tp = d.get(p.symbol, (0.0, 0.0, 0.0, 0.0, 0.0))
        d[p.symbol] = (q + v, c + abs(v) * p.price_open, vol + abs(v), p.sl or sl, p.tp or tp)
    return {s: (round(q, 8), c / vol if vol else 0.0, sl, tp) for s, (q, c, vol, sl, tp) in d.items()}

def deals_since(since):
    n = datetime.now()
    raw = mt5.history_deals_get(n - timedelta(days=int((time.time() - since) / 86400) + 3), n + timedelta(days=1)) or []
    ins = {d.position_id: d for d in raw if d.entry == mt5.DEAL_ENTRY_IN}
    rows, real = [], 0.0
    for d in raw:
        if d.type not in (mt5.DEAL_TYPE_BUY, mt5.DEAL_TYPE_SELL) or d.time - au.SRV_OFF < since: continue
        net = d.profit + d.commission + d.swap + d.fee; real += net
        if d.entry == mt5.DEAL_ENTRY_IN: continue
        i = ins.get(d.position_id)
        rows.append({"t": (d.time - au.SRV_OFF) * 1000, "sym": d.symbol, "side": "C" if d.type == mt5.DEAL_TYPE_SELL else "V",
                     "qty": d.volume, "entry": i.price if i else None, "exit": d.price, "pnl": net,
                     "origin": origin(i.magic if i else d.magic), "mode": "MT5", "reason": ""})
    rows.sort(key=lambda r: -r["t"])
    return rows, real

def deals_today():
    return deals_since(datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).timestamp())

async def feed_loop():
    while True:
        await asyncio.sleep(0.2)
        if not clients or mt5.terminal_info() is None: continue
        for s in watch_symbols():
            t = mt5.symbol_info_tick(s.name)
            if t is None: continue
            price = t.last if t.last > 0 else t.bid
            if price <= 0 or last_tick.get(s.name) == (price, t.bid, t.ask): continue
            last_tick[s.name] = (price, t.bid, t.ask)
            ms = int(t.time_msc - au.SRV_OFF * 1000) if t.time_msc else int(time.time() * 1000)
            await send_all({"type": "tick", "symbol": s.name, "price": float(price), "bid": float(t.bid), "ask": float(t.ask), "time": ms})

async def account_loop():
    n = 0
    while True:
        await asyncio.sleep(1); n += 1
        try:
            if mt5.terminal_info() is None: continue
            ENGINE.step(); oco.step(ENGINE.log)
            if not clients: continue
            cur = all_positions()
            for s in set(cur) | set(last_pos):
                new = cur.get(s, (0.0, 0.0, 0.0, 0.0))
                if last_pos.get(s) != new: await send_all({"type": "position", "symbol": s, "qty": new[0], "avg": new[1], "sl": new[2], "tp": new[3]})
            last_pos.clear(); last_pos.update(cur)
            ords = au.all_orders(); sig_o = json.dumps(ords)
            if sig_o != last_orders[0]: last_orders[0] = sig_o; await send_all({"type": "orders", "list": ords})
            if n % 3 == 0:
                rows, real = deals_today(); sig = json.dumps([rows, real])
                if sig != last_deals[0]:
                    last_deals[0] = sig
                    await send_all({"type": "deals", "rows": rows}); await send_all({"type": "realized", "value": real})
            st_o = oco.status(); sig_c = json.dumps(st_o)
            if sig_c != last_oco[0]: last_oco[0] = sig_c; await send_all({"type": "oco", "list": st_o})
            if n % 5 == 0: await send_all(account_msg())
            if n % 2 == 0: await send_all({"type": "auto", "list": ENGINE.status(), "log": ENGINE.logs[-30:]})
        except Exception as e:
            logging.error(f"account_loop: {e}")

async def handle_client(ws):
    clients.add(ws); last_tick.clear(); last_pos.clear(); last_deals[0] = None; last_orders[0] = None; last_oco[0] = None
    logging.info("Plataforma conectada à Bridge.")
    say = lambda t: ws.send(json.dumps({"type": "msg", "text": t}))
    try:
        if not ensure_mt5():
            await say("Erro: não foi possível conectar ao MetaTrader 5 (abra o terminal e faça login)."); 
        else:
            refresh_offset()
            await ws.send(json.dumps(account_msg()))
            await ws.send(json.dumps({"type": "strategies", "list": {k: {"params": v["params"]} for k, v in au.STRATS.items()}}))
        async for raw in ws:
            d = json.loads(raw); act = d.get("action")
            if act == "get_symbols":
                await ws.send(json.dumps({"type": "symbols", "symbols": {s.name: sym_info(s) for s in mt5.symbols_get() or []}}))
            elif act == "get_history":
                sym, tf = real_symbol(d.get("symbol")), int(d.get("tf", 5))
                mt5.symbol_select(sym, True)
                tfc = au.tf_const(tf)
                if tfc is None: await say(f"Tempo gráfico {tf}M não existe no MT5 (use 1-6,10,12,15,20,30,60,120,240,1440)."); continue
                rates = mt5.copy_rates_from_pos(sym, tfc, 0, 1000)
                candles = [{"t": (int(r["time"]) - au.SRV_OFF) * 1000, "o": float(r["open"]), "h": float(r["high"]),
                            "l": float(r["low"]), "c": float(r["close"]), "v": float(r["real_volume"] or r["tick_volume"])}
                           for r in (rates if rates is not None else [])]
                if not candles: logging.error(f"Sem candles para {sym}: {mt5.last_error()}")
                await ws.send(json.dumps({"type": "history", "symbol": d.get("symbol"), "tf": tf, "candles": candles}))
            elif act == "order":
                sym, buy, qty = real_symbol(d["symbol"]), d.get("side") == "BUY", float(d.get("qty", 1))
                if d.get("type") == "LIMIT" and d.get("price"): ok, m = au.pending(sym, buy, qty, float(d["price"]))
                else: ok, m = au.market(sym, buy, qty)
                if ok and d.get("oco"): oco.arm(sym, buy, d["oco"])      # OCO: stop + alvo + parciais
                await say(f"{'Ordem executada' if ok else 'Erro MT5'}: {d.get('side')} {qty} {sym}" + ("" if ok else f" ({m})"))
            elif act == "cancel":
                oco.disarm_waiting(real_symbol(d['symbol']))
                await say(f"{au.cancel_pending(real_symbol(d['symbol']))} ordem(ns) cancelada(s).")
            elif act == "set_sltp":                # stop/gain arrastados no gráfico
                ok, m = au.set_sltp(real_symbol(d["symbol"]), float(d.get("sl") or 0), float(d.get("tp") or 0))
                if not ok: await say(f"Stop/Gain: {m}")
            elif act == "modify_order":            # mover preço/lote de ordem pendente
                ok, m = au.modify_pending(d["ticket"], float(d["price"]), float(d["qty"]))
                if not ok: await say(f"Ordem: {m}")
            elif act == "cancel_order":
                au.cancel_ticket(d["ticket"])
            elif act == "log_trade":              # operação manual da SIMULAÇÃO local -> histórico permanente
                t = d["trade"]
                store.add({"t_close": t["t"] / 1000, "mode": "Simulação", "origin": t.get("origin", "Manual"), "sym": t["sym"], "side": t["side"],
                           "qty": t["qty"], "entry": t["entry"], "exit": t["exit"], "pnl": t["pnl"], "reason": t.get("reason", "")})
            elif act == "get_report":             # histórico: banco (simulação) + negociações do MT5
                days = max(1, min(365, int(d.get("days", 7))))
                since = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).timestamp() - (days - 1) * 86400
                rows = [{"t": r["t_close"] * 1000, "sym": r["sym"], "side": r["side"], "qty": r["qty"], "entry": r["entry"], "exit": r["exit"],
                         "pnl": r["pnl"], "origin": r["origin"], "mode": r["mode"], "reason": r["reason"] or ""} for r in store.since(since)]
                if not mt5_error_now(): rows += deals_since(since)[0]
                rows.sort(key=lambda r: -r["t"])
                await ws.send(json.dumps({"type": "report", "days": days, "rows": rows}))
            elif act == "auto_start":
                await say(ENGINE.add(d["cfg"])[1])
            elif act == "auto_stop":
                ENGINE.remove(int(d["id"]))
            if act in ("auto_start", "auto_stop"):
                await send_all({"type": "auto", "list": ENGINE.status(), "log": ENGINE.logs[-30:]})
    except websockets.exceptions.ConnectionClosed:
        logging.info("Conexão encerrada pelo cliente.")
    except Exception as e:
        logging.error(f"Erro na Bridge: {e}")
    finally:
        clients.discard(ws)

async def main_server():
    ensure_mt5()
    server = await websockets.serve(handle_client, "localhost", 8765)
    logging.info("Bridge MT5 rodando em ws://localhost:8765")
    asyncio.create_task(feed_loop()); asyncio.create_task(account_loop())
    await server.wait_closed()

def run_bridge():
    asyncio.run(main_server())

if __name__ == "__main__":
    run_bridge()
