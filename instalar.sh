#!/bin/zsh
# Instala todo lo necesario para AppMusica (solo hace falta una vez).
set -e
cd "$(dirname "$0")"

if ! command -v ffmpeg >/dev/null; then
  echo "→ Instalando ffmpeg…"
  brew install ffmpeg
fi
if ! command -v uv >/dev/null; then
  echo "→ Instalando uv…"
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

echo "→ Creando entorno de Python…"
[ -d .venv ] || uv venv --python 3.11 .venv
uv pip install --python .venv/bin/python -r requirements.txt

mkdir -p models
if [ ! -s models/piano_transcription.pth ]; then
  echo "→ Descargando modelo de piano de ByteDance (~165 MB)…"
  curl -L -o models/piano_transcription.pth \
    "https://zenodo.org/record/4034264/files/CRNN_note_F1%3D0.9677_pedal_F1%3D0.9186.pth?download=1"
fi

echo "→ Descargando modelo de separación Demucs…"
.venv/bin/python -c "from demucs.pretrained import get_model; get_model('htdemucs_6s')" 2>/dev/null

echo "✓ Listo. Abre la app con:  ./iniciar.command"
