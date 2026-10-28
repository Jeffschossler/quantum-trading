"""Motor de automações + funções de ordem (MetaTrader 5).
Cada automação roda em SIMULAÇÃO (posição virtual, dados reais do MT5, nenhuma ordem enviada) ou EXECUTANDO no MT5.
Roda dentro da bridge: continua operando mesmo com a tela fechada (use `python bridge.py`)."""
import importlib.util, json, logging, time
from datetime import datetime, timedelta
import numpy as np
import MetaTrader5 as mt5
import store

BASE = store.BASE
STRAT_DIR, SAVE = BASE / "strategies", BASE / "automations.json"
MAGIC_MANUAL, MAGIC_AUTO = 234000, 234100   # automação #N usa magic 234100+N
ALLOW_REAL_AUTOMATION = False               # deixe False: automação só roda em conta DEMO
SRV_OFF = 0                                 # offset hora do servidor MT5 (s); definido pela bridge

# ---------- estratégias ----------
def ema(x, n):
    k, out = 2 / (n + 1), np.empty(len(x))
    out[0] = x[0]
    for i in range(1, len(x)):
        out[i] = x[i] * k + out[i - 1] * (1 - k)
    return out

def cruzamento_medias(rates, p):
    """Mesma EMA 9/21 do gráfico. rates = só candles FECHADOS."""
    c = rates["close"]
    if len(c) < p["slow"] + 3:
        return None
    f, s = ema(c, p["fast"]), ema(c, p["slow"])
    if f[-2] <= s[-2] and f[-1] > s[-1]: return "BUY"
    if f[-2] >= s[-2] and f[-1] < s[-1]: return "SELL"
    return None

STRATS = {"cruzamento_medias": {"fn": cruzamento_medias, "params": {"fast": 9, "slow": 21}}}

def load_custom():
    """Qualquer .py na pasta strategies/ com signal(rates, params) -> 'BUY'|'SELL'|None."""
    for f in STRAT_DIR.glob("*.py") if STRAT_DIR.exists() else []:
        try:
            spec = importlib.util.spec_from_file_location(f.stem, f)
            m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
            STRATS[getattr(m, "NAME", f.stem)] = {"fn": m.signal, "params": dict(getattr(m, "PARAMS", {}))}
        except Exception as e:
            logging.error(f"Estratégia {f.name}: {e}")

# ---------- helpers MT5 ----------
def tf_const(m):
    m = int(m)
    if m < 60: return getattr(mt5, f"TIMEFRAME_M{m}", None)
    if m == 1440: return mt5.TIMEFRAME_D1
    return getattr(mt5, f"TIMEFRAME_H{m // 60}", None) if m % 60 == 0 else None

def is_demo():
    a = mt5.account_info()
    return bool(a and a.trade_mode == mt5.ACCOUNT_TRADE_MODE_DEMO)

def is_hedging():
    a = mt5.account_info()
    return bool(a and a.margin_mode == mt5.ACCOUNT_MARGIN_MODE_RETAIL_HEDGING)

def filling(info):
    fm = info.filling_mode  # bit1=FOK, bit2=IOC
    return mt5.ORDER_FILLING_IOC if fm & 2 else mt5.ORDER_FILLING_FOK if fm & 1 else mt5.ORDER_FILLING_RETURN

def norm_vol(info, v):
    step = info.volume_step or 0.01
    return max(info.volume_min, min(info.volume_max, round(round(v / step) * step, 8)))

def _send(req):
    res = mt5.order_send(req)
    if res is None: return False, f"Falha: {mt5.last_error()}"
    ok = res.retcode in (mt5.TRADE_RETCODE_DONE, mt5.TRADE_RETCODE_PLACED)
    return ok, "OK" if ok else f"Rejeitada {res.retcode}: {res.comment}"

def _deal(info, buy, vol, magic, comment, sl=0.0, tp=0.0, ticket=None):
    t = mt5.symbol_info_tick(info.name)
    if t is None: return False, "Sem cotação"
    req = {"action": mt5.TRADE_ACTION_DEAL, "symbol": info.name, "volume": norm_vol(info, vol),
           "type": mt5.ORDER_TYPE_BUY if buy else mt5.ORDER_TYPE_SELL, "price": t.ask if buy else t.bid,
           "deviation": 50, "magic": magic, "comment": comment[:30], "type_time": mt5.ORDER_TIME_GTC,
           "type_filling": filling(info)}
    if sl: req["sl"] = sl
    if tp: req["tp"] = tp
    if ticket: req["position"] = ticket
    return _send(req)

def market(symbol, buy, vol, magic=MAGIC_MANUAL, comment="Quantum", sl=0.0, tp=0.0):
    """Ordem a mercado. Em conta hedging, primeiro ZERA posições contrárias (comportamento de netting)."""
    info = mt5.symbol_info(symbol)
    if info is None: return False, f"Ativo {symbol} não encontrado"
    if not info.visible: mt5.symbol_select(symbol, True)
    rem = vol
    if is_hedging():
        opp = [p for p in (mt5.positions_get(symbol=symbol) or []) if (p.type == mt5.POSITION_TYPE_SELL) == buy]
        for p in sorted(opp, key=lambda x: x.time):
            if rem <= 1e-9: break
            v = min(p.volume, rem)
            ok, m = _deal(info, buy, v, magic, comment, ticket=p.ticket)
            if not ok: return False, m
            rem -= v
    if rem > 1e-9: return _deal(info, buy, rem, magic, comment, sl, tp)
    return True, "OK"

def pending(symbol, buy, vol, price, magic=MAGIC_MANUAL):
    info, t = mt5.symbol_info(symbol), mt5.symbol_info_tick(symbol)
    if info is None or t is None: return False, "Ativo/cotação indisponível"
    if buy: typ = mt5.ORDER_TYPE_BUY_LIMIT if price < t.ask else mt5.ORDER_TYPE_BUY_STOP
    else:   typ = mt5.ORDER_TYPE_SELL_LIMIT if price > t.bid else mt5.ORDER_TYPE_SELL_STOP
    return _send({"action": mt5.TRADE_ACTION_PENDING, "symbol": symbol, "volume": norm_vol(info, vol), "type": typ,
                  "price": price, "magic": magic, "comment": "Quantum", "type_time": mt5.ORDER_TIME_DAY,
                  "type_filling": mt5.ORDER_FILLING_RETURN})

def cancel_pending(symbol, magic=MAGIC_MANUAL):
    n = 0
    for o in mt5.orders_get(symbol=symbol) or []:
        if o.magic == magic:
            ok, _ = _send({"action": mt5.TRADE_ACTION_REMOVE, "order": o.ticket}); n += ok
    return n

def close_all(symbol, magic=None):
    info, n = mt5.symbol_info(symbol), 0
    for p in mt5.positions_get(symbol=symbol) or []:
        if magic is None or p.magic == magic:
            ok, _ = _deal(info, p.type == mt5.POSITION_TYPE_SELL, p.volume, p.magic, "Quantum:zerar", ticket=p.ticket); n += ok
    return n

def calc_profit(info, buy, vol, p0, p1):
    """Resultado exato na moeda da conta (o MT5 faz a conta); fallback por tick_value."""
    r = mt5.order_calc_profit(mt5.ORDER_TYPE_BUY if buy else mt5.ORDER_TYPE_SELL, info.name, vol, p0, p1)
    if r is not None: return float(r)
    tk, tv = info.trade_tick_size or info.point, info.trade_tick_value_profit or info.trade_tick_value
    return (p1 - p0) * (1 if buy else -1) * vol * (tv / tk if tk and tv else 1)

# ---------- automação ----------
class Auto:
    def __init__(s, aid, cfg):
        s.id, s.cfg, s.magic, s.sim = aid, cfg, MAGIC_AUTO + aid, bool(cfg.get("sim"))
        s.last_bar, s.trades, s.day = None, 0, datetime.now().date()
        s.state, s.last, s._pt, s._real_day = "armando", "—", 0.0, 0.0
        s.virt, s.partials = None, set()

    sym = property(lambda s: s.cfg["symbol"])
    _mid = staticmethod(lambda: datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).timestamp())

    def positions(s):
        return [p for p in (mt5.positions_get(symbol=s.sym) or []) if p.magic == s.magic]

    def side(s):  # +1 comprado, -1 vendido, 0 zerado
        if s.sim: return 0 if not s.virt else (1 if s.virt["buy"] else -1)
        p = s.positions(); return 0 if not p else (1 if p[0].type == mt5.POSITION_TYPE_BUY else -1)

    def refresh_day(s):
        """Resultado REALIZADO do dia (cache de 10 s)."""
        if time.time() - s._pt < 10: return
        s._pt = time.time()
        if s.sim: s._real_day = store.pnl_today(s.id, s._mid()); return
        n = datetime.now()
        s._real_day = sum(d.profit + d.commission + d.swap + d.fee
                          for d in (mt5.history_deals_get(n - timedelta(days=2), n + timedelta(days=1)) or [])
                          if d.magic == s.magic and d.symbol == s.sym and d.time - SRV_OFF >= s._mid())

    def floating(s):
        if not s.sim: return sum(p.profit for p in s.positions())
        v, t, info = s.virt, mt5.symbol_info_tick(s.sym), mt5.symbol_info(s.sym)
        return calc_profit(info, v["buy"], v["vol"], v["entry"], t.bid if v["buy"] else t.ask) if v and t and info else 0.0

    # --- virtual ---
    def close_virtual(s, vol, price, reason, log):
        v, info = s.virt, mt5.symbol_info(s.sym)
        pnl = calc_profit(info, v["buy"], vol, v["entry"], price)
        store.add({"t_open": v["t"], "t_close": time.time(), "mode": "Simulação", "origin": f"Auto #{s.id}", "auto_id": s.id,
                   "sym": s.sym, "side": "C" if v["buy"] else "V", "qty": vol, "entry": v["entry"], "exit": price, "pnl": pnl, "reason": reason})
        v["vol"] = round(v["vol"] - vol, 8)
        if v["vol"] <= 1e-9: s.virt = None
        s._pt, s.last = 0.0, f"{reason} {pnl:+.2f}"
        log(f"#{s.id} [SIM] {reason}: {vol} {s.sym} @ {price} -> {pnl:+.2f}")

    def partial(s, info, vol, frac, do, log):
        step = info.volume_step or 0.01
        q = round(int(vol * frac / step + 1e-9) * step, 8)
        if q < info.volume_min or vol - q < info.volume_min - 1e-9:
            return log(f"#{s.id} parcial ignorada: lote {vol} pequeno demais para dividir")
        do(q); log(f"#{s.id} parcial: {q} de {vol}")

    def manage(s, log):
        """Stop/alvo/parcial. Virtual: checados aqui. Real: stop/alvo ficam no MT5; aqui só a parcial."""
        c, info = s.cfg, mt5.symbol_info(s.sym)
        if info is None: return
        sl, tp, par, frac = c["sl"], c["tp"], c.get("parcial", 0), c.get("frac", 0.5)
        if s.sim:
            v, t = s.virt, mt5.symbol_info_tick(s.sym)
            if not v or t is None: return
            price = t.bid if v["buy"] else t.ask
            pts = (price - v["entry"]) * (1 if v["buy"] else -1)
            if sl > 0 and pts <= -sl: s.close_virtual(v["vol"], price, "stop", log)
            elif tp > 0 and pts >= tp: s.close_virtual(v["vol"], price, "alvo", log)
            elif par > 0 and not v["par"] and pts >= par:
                v["par"] = True
                s.partial(info, v["vol"], frac, lambda q: s.close_virtual(q, price, "parcial", log), log)
        elif par > 0:
            for p in s.positions():
                if p.ticket in s.partials: continue
                buy = p.type == mt5.POSITION_TYPE_BUY
                if (p.price_current - p.price_open) * (1 if buy else -1) >= par:
                    s.partials.add(p.ticket)
                    s.partial(info, p.volume, frac, lambda q, p=p, buy=buy: _deal(info, not buy, q, s.magic, f"Quantum parcial#{s.id}", ticket=p.ticket), log)

    def flat(s, reason, log):
        if s.sim:
            t = mt5.symbol_info_tick(s.sym)
            if s.virt and t: s.close_virtual(s.virt["vol"], t.bid if s.virt["buy"] else t.ask, reason, log)
        elif s.positions():
            close_all(s.sym, s.magic); log(f"#{s.id} zerado ({reason})")

    def open(s, buy, log):
        c, info, t = s.cfg, mt5.symbol_info(s.sym), mt5.symbol_info_tick(s.sym)
        if info is None or t is None: s.last = "sem cotação"; return
        px, nome = (t.ask if buy else t.bid), ("BUY" if buy else "SELL")
        if s.sim:
            s.virt = {"buy": buy, "vol": norm_vol(info, c["lot"]), "entry": px, "t": time.time(), "par": False}
            s.trades += 1; s.last = f"{nome} @ {px}"; log(f"#{s.id} [SIM] {nome} {c['lot']} {s.sym} @ {px}"); return
        sl = round(px - c["sl"] if buy else px + c["sl"], info.digits) if c["sl"] > 0 else 0.0
        tp = round(px + c["tp"] if buy else px - c["tp"], info.digits) if c["tp"] > 0 else 0.0
        ok, m = _deal(info, buy, c["lot"], s.magic, f"Quantum auto#{s.id}", sl, tp)
        s.trades += ok; s.last = f"{nome} @ {px}" if ok else m
        log(f"#{s.id} {nome} {c['lot']} {s.sym} @ {px}: {m}")

    def step(s, log):
        c, now = s.cfg, datetime.now()
        if now.date() != s.day: s.day, s.trades, s.state = now.date(), 0, "armando"
        s.refresh_day(); s.manage(log)
        if s.state.startswith("parado"): return
        hm, dia = now.strftime("%H:%M"), s._real_day + s.floating()
        if hm >= c["flat"]: s.flat("fim do dia", log); s.state = "fora do horário"; return
        if c["max_loss"] > 0 and dia <= -c["max_loss"]:
            s.flat("perda diária", log); s.state = "parado: perda diária"; log(f"#{s.id} PARADA: perda do dia {dia:.2f}"); return
        if c.get("meta", 0) > 0 and dia >= c["meta"]:
            s.flat("meta do dia", log); s.state = "parado: meta do dia"; log(f"#{s.id} PARADA: meta do dia {dia:.2f}"); return
        rates = mt5.copy_rates_from_pos(s.sym, tf_const(c["tf"]), 0, 1000)
        if rates is None or len(rates) < 30: s.last = "sem dados"; return
        bar = int(rates[-1]["time"])                 # candle em formação
        if s.last_bar is None: s.last_bar, s.state = bar, "rodando"; return
        if bar == s.last_bar: return
        s.last_bar = bar
        if not (c["start"] <= hm < c["end"]): s.state = "fora do horário"; return
        s.state = "rodando"
        st = STRATS[c["strategy"]]
        sig = st["fn"](rates[:-1], c.get("params") or st["params"])
        if not sig: return
        buy, cur = sig == "BUY", s.side()
        if cur:
            if (cur > 0) == buy: return
            s.flat("sinal contrário", log)
            if not c.get("reverse"): return
        if s.trades >= c["max_trades"]: s.state = "limite de ops do dia"; return
        s.open(buy, log)

    def info(s):
        fl, side = s.floating(), s.side()
        q = (s.virt["vol"] if s.virt else 0) if s.sim else sum(p.volume for p in s.positions())
        return {"id": s.id, "strategy": s.cfg["strategy"], "symbol": s.sym, "tf": s.cfg["tf"], "lot": s.cfg["lot"], "trades": s.trades,
                "state": s.state, "last": s.last, "sim": s.sim, "open": fl, "day": s._real_day + fl,
                "pos": "Zerado" if not side else f"{'C' if side > 0 else 'V'} {q}"}

class Engine:
    def __init__(s): s.items, s.next, s.logs, s.loaded = {}, 1, [], False

    def log(s, t):
        line = f"{datetime.now():%H:%M:%S} {t}"; logging.info(line); s.logs = (s.logs + [line])[-60:]

    def add(s, cfg, aid=None):
        try:
            cfg.update(tf=int(cfg["tf"]), lot=float(cfg["lot"]), sl=float(cfg["sl"]), tp=float(cfg["tp"]), max_trades=int(cfg["max_trades"]),
                       max_loss=float(cfg["max_loss"]), parcial=float(cfg.get("parcial", 0)), frac=float(cfg.get("frac", 0.5)),
                       meta=float(cfg.get("meta", 0)), sim=bool(cfg.get("sim")))
        except Exception:
            return False, "Parâmetros inválidos"
        if not cfg["sim"] and not is_demo() and not ALLOW_REAL_AUTOMATION:
            return False, "Conta REAL: execução bloqueada (ALLOW_REAL_AUTOMATION=False). Use o modo Simulação ou uma conta demo."
        if cfg["strategy"] not in STRATS: return False, "Estratégia desconhecida"
        if tf_const(cfg["tf"]) is None: return False, "Tempo gráfico não suportado pelo MT5"
        if not mt5.symbol_select(cfg["symbol"], True): return False, f"Ativo {cfg['symbol']} não encontrado"
        aid = aid or s.next; s.next = max(s.next, aid + 1)
        s.items[aid] = Auto(aid, cfg); s.save()
        s.log(f"Automação #{aid} iniciada ({'SIMULAÇÃO' if cfg['sim'] else 'MT5'}): {cfg['strategy']} {cfg['symbol']} {cfg['tf']}M lote {cfg['lot']}")
        return True, f"Automação #{aid} iniciada"

    def remove(s, aid):
        a = s.items.get(aid)
        if not a: return
        if a.sim: a.flat("automação parada", s.log)
        del s.items[aid]; s.save()
        s.log(f"Automação #{aid} parada" + ("" if a.sim else " (posições abertas mantêm stop/alvo)"))

    def step(s):
        for a in list(s.items.values()):
            try: a.step(s.log)
            except Exception as e: a.last = f"erro: {e}"; s.log(f"#{a.id} erro: {e}")

    def status(s):
        out = []
        for a in s.items.values():
            try: out.append(a.info())
            except Exception as e: out.append({"id": a.id, "strategy": a.cfg["strategy"], "symbol": a.sym, "tf": a.cfg["tf"], "lot": a.cfg["lot"],
                                               "trades": a.trades, "state": f"erro: {e}", "last": "", "sim": a.sim, "open": 0, "day": 0, "pos": "?"})
        return out

    def save(s):
        SAVE.write_text(json.dumps({str(k): a.cfg for k, a in s.items.items()}), encoding="utf-8")

    def load(s):
        s.loaded = True; load_custom()
        try:
            for k, cfg in json.loads(SAVE.read_text(encoding="utf-8")).items(): s.add(cfg, int(k))
        except FileNotFoundError: pass
        except Exception as e: logging.error(f"automations.json: {e}")

# ---------- ordens pendentes e stop/gain (usadas pelo gráfico) ----------
def all_orders():
    out = []
    for o in mt5.orders_get() or []:
        buy = o.type in (mt5.ORDER_TYPE_BUY_LIMIT, mt5.ORDER_TYPE_BUY_STOP, mt5.ORDER_TYPE_BUY_STOP_LIMIT)
        lim = o.type in (mt5.ORDER_TYPE_BUY_LIMIT, mt5.ORDER_TYPE_SELL_LIMIT)
        out.append({"ticket": o.ticket, "sym": o.symbol, "side": "BUY" if buy else "SELL", "qty": o.volume_current,
                    "price": o.price_open, "kind": "L" if lim else "S"})
    return out

def set_sltp(symbol, sl, tp):
    """Stop/gain da POSIÇÃO inteira (0 remove)."""
    info, n, last = mt5.symbol_info(symbol), 0, "Sem posição aberta"
    for p in mt5.positions_get(symbol=symbol) or []:
        ok, last = _send({"action": mt5.TRADE_ACTION_SLTP, "symbol": symbol, "position": p.ticket,
                          "sl": round(sl, info.digits) if sl else 0.0, "tp": round(tp, info.digits) if tp else 0.0})
        n += ok
    return n > 0, "OK" if n else last

def cancel_ticket(ticket):
    return _send({"action": mt5.TRADE_ACTION_REMOVE, "order": int(ticket)})

def modify_pending(ticket, price, qty):
    o = next(iter(mt5.orders_get(ticket=int(ticket)) or []), None)
    if o is None: return False, "Ordem não encontrada (já executada?)"
    info = mt5.symbol_info(o.symbol)
    if abs(o.volume_current - qty) > 1e-9:       # o MT5 não edita volume: cancela e recria
        ok, m = _send({"action": mt5.TRADE_ACTION_REMOVE, "order": o.ticket})
        if not ok: return ok, m
        buy = o.type in (mt5.ORDER_TYPE_BUY_LIMIT, mt5.ORDER_TYPE_BUY_STOP, mt5.ORDER_TYPE_BUY_STOP_LIMIT)
        return pending(o.symbol, buy, qty, round(price, info.digits), o.magic)
    return _send({"action": mt5.TRADE_ACTION_MODIFY, "order": o.ticket, "symbol": o.symbol, "price": round(price, info.digits), "sl": o.sl, "tp": o.tp})
