"""Extract text subtitles once on an administrator's PC, outside Render playback.
Requires ffprobe and ffmpeg on PATH. Never burns subtitles into the video.
"""
import argparse
import json
import subprocess
from pathlib import Path

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", help="Local MKV path or provider URL")
    parser.add_argument("--output", default=".private-artwork/subtitles")
    args = parser.parse_args()
    destination = Path(args.output)
    destination.mkdir(parents=True, exist_ok=True)
    probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "s", "-show_streams", "-of", "json", args.input], capture_output=True, text=True, timeout=60)
    if probe.returncode:
        raise RuntimeError("No se pudieron leer las pistas. Comprueba el archivo o acceso al proveedor.")
    streams = json.loads(probe.stdout).get("streams", [])
    prepared = []
    for stream in streams:
        codec = stream.get("codec_name", "")
        if codec not in {"subrip", "ass", "ssa", "webvtt", "mov_text", "text"}:
            print("Pista", stream["index"], "omitida: subtítulos de imágenes o formato no compatible:", codec)
            continue
        target = destination / ("track-" + str(stream["index"]) + ".vtt")
        if target.exists():
            raise RuntimeError("Usa otra carpeta de salida: ya existe " + target.name)
        result = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", args.input, "-map", "0:" + str(stream["index"]), "-c:s", "webvtt", str(target)], capture_output=True, timeout=1800)
        if result.returncode:
            target.unlink(missing_ok=True)
            raise RuntimeError("No se pudo extraer la pista " + str(stream["index"]))
        prepared.append({"file":target.name, "language":stream.get("tags", {}).get("language", ""), "codec":codec})
    (destination / "tracks.json").write_text(json.dumps(prepared, ensure_ascii=False, indent=2), encoding="utf-8")
    print(len(prepared), "pistas preparadas. Súbelas desde Subtítulos externos en el adminpanel.")

if __name__ == "__main__":
    try:
        main()
    except FileNotFoundError:
        raise SystemExit("Necesitas ffprobe y ffmpeg instalados en el PC.")
    except subprocess.TimeoutExpired:
        raise SystemExit("La extracción excedió el límite de espera. No se ha publicado nada.")
    except RuntimeError as error:
        raise SystemExit(str(error))
