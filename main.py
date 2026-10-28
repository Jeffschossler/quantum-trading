"""Quantum Trading - janela desktop (pywebview) + bridge MT5 em segundo plano."""
import sys
import threading
from pathlib import Path

import webview

from bridge import run_bridge


def base_dir() -> Path:
    # Dentro do .exe (PyInstaller) os arquivos ficam em _MEIPASS
    return Path(getattr(sys, "_MEIPASS", Path(__file__).parent))


def main():
    # Inicia a bridge do MT5 em segundo plano
    threading.Thread(target=run_bridge, daemon=True).start()
    
    # Aponta para o index.html correto da interface
    html = base_dir() / "index.html"
    
    webview.create_window("Quantum Trading", html.as_uri(), width=1500, height=900, min_size=(1000, 600))
    webview.start()


if __name__ == "__main__":
    main()