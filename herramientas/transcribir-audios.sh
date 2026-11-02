#!/usr/bin/env bash
# Transcribe notas de voz (WhatsApp .ogg/.opus, .mp3, .m4a, .wav…) al español, en local, con Whisper "small".
#
#   herramientas/transcribir-audios.sh audio1.ogg [audio2.ogg ...]
#
# Necesita: python3, pip, ffmpeg y curl.
# Modelo: se intenta descargar de Hugging Face; si está bloqueado (como en los entornos en la nube
# de Claude Code), se descarga el MISMO modelo (Whisper small, CTranslate2 int8) empaquetado en npm
# en 4 trozos, se une y se comprueba su SHA-256.
set -euo pipefail

if [ "$#" -lt 1 ]; then
  sed -n '2,10p' "$0"
  exit 1
fi

DIR="$(cd "$(dirname "$0")" && pwd)"
MODELO="${MODELO_WHISPER:-$HOME/.cache/whisper-small-ct2}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

python3 -c "import faster_whisper" 2>/dev/null || pip install -q faster-whisper

if [ ! -f "$MODELO/model.bin" ]; then
  if curl -fsS -m 10 -o /dev/null https://huggingface.co/api/models/Systran/faster-whisper-small 2>/dev/null; then
    MODELO="small"   # faster-whisper lo descarga solo
  else
    echo "Hugging Face no está accesible: descargando el modelo desde npm…" >&2
    mkdir -p "$MODELO"
    for i in 0 1 2 3; do
      curl -fsSL -o "$TMP/p$i.tgz" \
        "https://registry.npmjs.org/@skillninja/shortmovie-telop-model-p$i/-/shortmovie-telop-model-p$i-1.0.0.tgz"
      mkdir -p "$TMP/p$i" && tar -xzf "$TMP/p$i.tgz" -C "$TMP/p$i"   # sin npm install: no se ejecuta nada del paquete
    done
    cat "$TMP"/p0/package/model.bin.part0 "$TMP"/p1/package/model.bin.part1 \
        "$TMP"/p2/package/model.bin.part2 "$TMP"/p3/package/model.bin.part3 > "$MODELO/model.bin"
    cp "$TMP"/p0/package/{config.json,tokenizer.json,vocabulary.json,preprocessor_config.json} "$MODELO/"
    esperado="$(tr -d ' \n' < "$TMP/p0/package/model.sha256")"
    obtenido="$(sha256sum "$MODELO/model.bin" | cut -d' ' -f1)"
    if [ "$esperado" != "$obtenido" ]; then
      echo "ERROR: el SHA-256 del modelo no coincide" >&2
      rm -f "$MODELO/model.bin"
      exit 1
    fi
  fi
fi

WAVS=()
for f in "$@"; do
  salida="$TMP/$(basename "${f%.*}").wav"
  ffmpeg -loglevel error -y -i "$f" -ar 16000 -ac 1 "$salida"
  WAVS+=("$salida")
done

HF_HUB_OFFLINE=$([ "$MODELO" = "small" ] && echo 0 || echo 1) \
  python3 -I "$DIR/transcribir.py" "$MODELO" "${WAVS[@]}" 2>&1 | grep -vi 'warning'
