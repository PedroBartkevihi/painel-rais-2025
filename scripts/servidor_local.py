"""Serve a pasta docs/ em http://localhost:8765 para testar o painel antes de publicar.

Uso:
    python scripts/servidor_local.py
"""
import functools
import http.server
from pathlib import Path

PASTA = Path(__file__).resolve().parents[1] / "docs"
PORTA = 8765


class Manipulador(http.server.SimpleHTTPRequestHandler):
    # O Windows às vezes registra .js como text/plain, o que bloqueia módulos ES no navegador
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".json": "application/json",
        ".css": "text/css",
    }


if __name__ == "__main__":
    print(f"Painel em http://localhost:{PORTA}", flush=True)
    servidor = http.server.ThreadingHTTPServer(("127.0.0.1", PORTA), functools.partial(Manipulador, directory=PASTA))
    servidor.serve_forever()
