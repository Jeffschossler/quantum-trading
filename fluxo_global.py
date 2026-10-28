"""Estratégia de fluxo (agressão + VWAP) portada do seu robô, sem pandas.
rates = só candles FECHADOS. Volume comprador/vendedor é ESTIMADO pela posição do fechamento no candle
(CFDs como US500 não têm fita). Antes o robô dividia o volume 50/50, o que zerava o delta e impedia qualquer sinal."""
import numpy as np

NAME = "fluxo_global"
PARAMS = {"z_entry": 1.5, "flow_span": 9, "z_window": 20}

def _ewm(x, span):
    a, out = 2.0 / (span + 1), np.empty(len(x))
    out[0] = x[0]
    for i in range(1, len(x)):
        out[i] = a * x[i] + (1 - a) * out[i - 1]
    return out

def _zscore(x, w, minp=5):
    z = np.zeros(len(x))
    for i in range(len(x)):
        seg = x[max(0, i - w + 1): i + 1]
        if len(seg) >= minp and len(seg) > 1:
            sd = seg.std(ddof=1)
            z[i] = (x[i] - seg.mean()) / sd if sd > 0 else 0.0
    return z

def signal(rates, p):
    n = len(rates)
    if n < 30:
        return None
    h, l, c = (rates[k].astype(float) for k in ("high", "low", "close"))
    vol, rng = rates["tick_volume"].astype(float), h - l
    buy = np.where(rng > 0, vol * (c - l) / np.where(rng > 0, rng, 1), vol / 2)
    delta = buy - (vol - buy)
    ratio = np.where(vol > 0, delta / np.where(vol > 0, vol, 1), 0.0)
    flow, z = _ewm(ratio, int(p["flow_span"])), _zscore(delta, int(p["z_window"]))
    day = rates["time"] // 86400                      # delta acumulado e VWAP reiniciam a cada dia
    cum, pv, vv = np.zeros(n), np.zeros(n), np.zeros(n)
    for i in range(n):
        new = i == 0 or day[i] != day[i - 1]
        cum[i] = delta[i] + (0 if new else cum[i - 1])
        pv[i] = c[i] * vol[i] + (0 if new else pv[i - 1])
        vv[i] = vol[i] + (0 if new else vv[i - 1])
    dist = c[-1] - (pv[-1] / vv[-1] if vv[-1] > 0 else c[-1])
    slope, zl = cum[-1] - cum[-6], float(p["z_entry"])
    if z[-1] > zl and flow[-1] > 0 and slope > 0 and dist > 0: return "BUY"
    if z[-1] < -zl and flow[-1] < 0 and slope < 0 and dist < 0: return "SELL"
    return None
