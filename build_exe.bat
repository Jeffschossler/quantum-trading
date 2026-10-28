@echo off
REM Gera dist\QuantumTrading.exe (rode no Windows, na pasta do projeto)
if not exist venv python -m venv venv
call venv\Scripts\activate
pip install -r requirements.txt
pyinstaller --noconfirm --onefile --windowed --name QuantumTrading --add-data "platform.html;." main.py
echo.
echo Pronto: dist\QuantumTrading.exe
pause