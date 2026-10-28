"""OCO (stop + alvo + parciais) para ordens manuais na conta MT5.
Stop e alvo final vão na própria posição (SL/TP no servidor). As parciais são acompanhadas pela bridge (deixe-a aberta)."""
import MetaTrader5 as mt5
import automation as au

OCOS = {}   # símbolo -> estado

def _net(symbol):
    return sum(p.volume if p.type == mt5.POSITION_TYPE_BUY else -p.volume for p in mt5.positions_get(symbol=symbol) or [])

def arm(symbol, buy, cfg):
    OCOS[symbol] = {"buy": buy, "cfg": cfg, "before": _net(symbol), "armed": False, "parts": [], "dir": 1}

def disarm_waiting(symbol):
    o = OCOS.get(symbol)
    if o and not o["armed"]: del OCOS[symbol]

def status():
    return {s: [{"p": l["p"], "q": l["q"], "pct": l["pct"]} for l in o["parts"] if not l["done"]] for s, o in OCOS.items() if o["armed"]}

def step(log):
    for sym, o in list(OCOS.items()):
        pos, net, info = list(mt5.positions_get(symbol=sym) or []), _net(sym), mt5.symbol_info(sym)
        if info is None: continue
        if not o["armed"]:                                        # espera a entrada ser executada
            grew = net > max(o["before"], 0) + 1e-9 if o["buy"] else net < min(o["before"], 0) - 1e-9
            if not grew: continue
            side = [p for p in pos if (p.type == mt5.POSITION_TYPE_BUY) == (net > 0)]
            vol = sum(p.volume for p in side); avg = sum(p.volume * p.price_open for p in side) / vol
            d, c = (1 if net > 0 else -1), o["cfg"]
            sl = avg - d * c["sl"] if c.get("sl") else 0.0
            tp = avg + d * c["tp"] if c.get("tp") else 0.0
            ok, m = au.set_sltp(sym, sl, tp)
            stp, used = info.volume_step or 0.01, 0.0
            for pt in c.get("parts", []):
                q = round(int(vol * pt["pct"] / 100 / stp + 1e-9) * stp, 8)
                if q >= info.volume_min and used + q < vol - 1e-9:
                    o["parts"].append({"p": round(avg + d * pt["pts"], info.digits), "q": q, "pct": pt["pct"], "done": False}); used += q
                else:
                    log(f"OCO {sym}: parcial de {pt['pts']} pts ignorada (lote pequeno demais)")
            o.update(armed=True, dir=d)
            log(f"OCO {sym} armada: SL {sl or '-'} · TP {tp or '-'} · {len(o['parts'])} parcial(is)" + ("" if ok else f" (SL/TP: {m})"))
            continue
        if abs(net) < 1e-9:
            del OCOS[sym]; log(f"OCO {sym} encerrada"); continue
        tk = mt5.symbol_info_tick(sym)
        if tk is None: continue
        price = tk.bid if o["dir"] > 0 else tk.ask
        for l in o["parts"]:
            if l["done"] or not ((price >= l["p"]) if o["dir"] > 0 else (price <= l["p"])): continue
            l["done"] = True
            p = next((p for p in pos if (p.type == mt5.POSITION_TYPE_BUY) == (o["dir"] > 0)), None)
            if p:
                q = min(l["q"], p.volume)
                ok, m = au._deal(info, o["dir"] < 0, q, p.magic, "Quantum OCO parcial", ticket=p.ticket)
                log(f"OCO {sym}: parcial {q} @ {price} - {m}")
