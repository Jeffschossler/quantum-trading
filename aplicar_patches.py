"""Rode na pasta do projeto:  python aplicar_patches.py   (faz backup .bak de cada arquivo alterado)"""
import pathlib, shutil
P = [
 ("index.html", '<script src="app.js"></script>', '<script src="app.js"></script>\n<script src="dock.js"></script>'),
 ("index.html", '<option value="sim">Simulação (Demo)</option><option value="real">Conta Real</option>',
                '<option value="sim">Simulação (local)</option><option value="real">Conta MT5</option>'),
 ("app.js", "const money=v=>(v<0?'-':'')+'R$ '+Math.abs(v)", "var CUR='R$';const money=v=>(v<0?'-':'')+CUR+' '+Math.abs(v)"),
 ("index.html", '<script src="dock.js"></script>', '<script src="dock.js"></script>\n<script src="ordens.js"></script>'),
 ("app.js", "p.currentPriceRange = hi - lo;", "p.currentPriceRange = hi - lo; p.vLo=lo; p.vHi=hi; p.vCh=ch; p.vCw=cw;"),
 ("app.js", "r?'CONTA REAL':'Simulação'", "r?'MT5':'Simulação'"),
 ("app.js", "(SYMS[k].n&&SYMS[k].n.toUpperCase().includes(q)));", "(SYMS[k].n&&SYMS[k].n.toUpperCase().includes(q))).slice(0,80);"),
]
done = set()
for f, old, new in P:
    p = pathlib.Path(f)
    if not p.exists(): print("NÃO ACHEI", f); continue
    t = p.read_text(encoding="utf-8")
    if new in t: print("já aplicado:", f, old[:40]); continue
    if old not in t: print("NÃO ENCONTRADO em", f, "->", old[:50]); continue
    if f not in done: shutil.copy(p, f + ".bak"); done.add(f)
    p.write_text(t.replace(old, new, 1), encoding="utf-8"); print("ok:", f, old[:40])
