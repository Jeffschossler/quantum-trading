# Quantum Trading (desktop)

## Rodar no VS Code
1. Abra esta pasta no VS Code.
2. Terminal: `python -m venv venv` e `venv\Scripts\activate`
3. `pip install -r requirements.txt`
4. Abra o MetaTrader 5 e faça login (conta demo ou real).
5. `python main.py`

- **Simulação:** funciona sem MT5.
- **Conta Real:** conecta sozinha à bridge (ws://127.0.0.1:8765) e envia as ordens ao MT5.
- Ajuste o dicionário `SYMBOLS` em `bridge.py` e o `SYMS` em `platform.html` para seus ativos/vencimentos.

## Gerar o .exe
Rode `build_exe.bat` (ou os comandos dele). O resultado fica em `dist\QuantumTrading.exe`.
O MT5 precisa estar aberto no computador; o Windows precisa do WebView2 (já vem no Windows 10/11 atualizado).