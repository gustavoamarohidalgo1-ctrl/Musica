#!/bin/zsh
# Doble clic en este archivo para abrir AppMusica.
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
if [ ! -x .venv/bin/python ]; then
  ./instalar.sh || exit 1
fi
URL="http://127.0.0.1:8765"
if curl -s -o /dev/null "$URL/api/info"; then
  open "$URL"; exit 0
fi
echo "Iniciando AppMusica en $URL  (cierra esta ventana para detenerla)"
( for i in {1..60}; do sleep 1; curl -s -o /dev/null "$URL/api/info" && open "$URL" && break; done ) &
exec .venv/bin/python -m app.server
