"""Modelo de estratégia própria. Copie este arquivo, mude NAME/PARAMS e a lógica de signal().
rates = candles FECHADOS (numpy: rates['open'|'high'|'low'|'close'|'tick_volume'|'time'])."""
NAME = "rompimento"
PARAMS = {"n": 20}

def signal(rates, p):
    n = int(p["n"])
    if len(rates) < n + 2: return None
    c, hi, lo = rates["close"], rates["high"][-n-1:-1].max(), rates["low"][-n-1:-1].min()
    if c[-1] > hi: return "BUY"
    if c[-1] < lo: return "SELL"
    return None