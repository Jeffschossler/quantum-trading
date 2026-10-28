"""Armazenamento de operações: SQLite (quantum.db) + CSV por dia (historico/trades_AAAA-MM-DD.csv)."""
import csv, pathlib, sqlite3, sys, time
from datetime import datetime

BASE = pathlib.Path(sys.executable).parent if getattr(sys, "frozen", False) else pathlib.Path(__file__).parent
DB, CSV_DIR = BASE / "quantum.db", BASE / "historico"
COLS = ["t_open", "t_close", "mode", "origin", "auto_id", "sym", "side", "qty", "entry", "exit", "pnl", "reason"]
SCHEMA = ("create table if not exists trades(id integer primary key autoincrement, t_open real, t_close real, mode text, "
          "origin text, auto_id integer, sym text, side text, qty real, entry real, exit real, pnl real, reason text)")

def _run(sql, args=(), fetch=False):
    c = sqlite3.connect(DB); c.row_factory = sqlite3.Row
    try:
        c.execute(SCHEMA)
        out = [dict(r) for r in c.execute(sql, args).fetchall()] if fetch else (c.execute(sql, args) and None)
        c.commit(); return out
    finally:
        c.close()

def add(tr):
    """tr: chaves de COLS (tempos em segundos; side 'C'/'V'; mode 'Simulação')."""
    row = {k: tr.get(k) for k in COLS}
    row["t_close"] = row["t_close"] or time.time()
    _run(f"insert into trades({','.join(COLS)}) values({','.join('?' * len(COLS))})", [row[k] for k in COLS])
    CSV_DIR.mkdir(exist_ok=True)
    f = CSV_DIR / f"trades_{datetime.fromtimestamp(row['t_close']):%Y-%m-%d}.csv"
    novo = not f.exists()
    with f.open("a", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh, delimiter=";")
        if novo: w.writerow(COLS)
        w.writerow([row[k] for k in COLS])

def since(ts):
    return _run("select * from trades where t_close>=? order by t_close desc", (ts,), True)

def pnl_today(auto_id, mid):
    return _run("select coalesce(sum(pnl),0) as p from trades where auto_id=? and t_close>=?", (auto_id, mid), True)[0]["p"]
