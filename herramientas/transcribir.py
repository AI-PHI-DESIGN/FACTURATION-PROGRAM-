"""Transcribe archivos WAV (16 kHz, mono) al español con faster-whisper.

Uso:  python3 -I transcribir.py <carpeta-o-nombre-del-modelo> audio1.wav [audio2.wav ...]

Se le pasan WAV (no .ogg) porque la versión de faster-whisper/PyAV de este entorno
falla al abrir .ogg directamente; transcribir-audios.sh hace la conversión con ffmpeg.
"""
import sys
import wave

import numpy as np
from faster_whisper import WhisperModel

# Vocabulario del tema: ayuda a Whisper con palabras técnicas (CIF, IVA, base imponible…).
# Cámbialo según el proyecto, o déjalo vacío con PROMPT="".
PROMPT = (
    "Conversación sobre un programa de facturación: factura, numeración correlativa, CIF, NIF, "
    "dirección, población, concepto, base imponible, IVA, total, forma de pago, número de cuenta, "
    "cobrado, pestaña de contabilidad."
)


def cargar_wav(ruta):
    with wave.open(ruta) as w:
        datos = w.readframes(w.getnframes())
    return np.frombuffer(datos, dtype=np.int16).astype(np.float32) / 32768.0


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    modelo = WhisperModel(sys.argv[1], device="cpu", compute_type="int8")
    for ruta in sys.argv[2:]:
        audio = cargar_wav(ruta)
        segmentos, info = modelo.transcribe(
            audio, language="es", beam_size=8, initial_prompt=PROMPT or None
        )
        print(f"\n===== {ruta.split('/')[-1]}  ({info.duration:.0f} s)")
        for s in segmentos:
            print(f"[{s.start:6.1f}-{s.end:6.1f}] {s.text.strip()}")


if __name__ == "__main__":
    main()
