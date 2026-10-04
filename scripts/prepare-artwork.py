"""Prepare optimized local covers. Never runs the old bot or reads its sessions."""
import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
from PIL import Image, ImageOps

parser = argparse.ArgumentParser()
parser.add_argument('--images', default=r'D:\ottplayer_portadas')
parser.add_argument('--output', default='.private-artwork/local-covers.json')
args = parser.parse_args()
assets, rejected = [], []
for path in sorted(Path(args.images).iterdir()):
    if path.suffix.lower() not in ('.jpg', '.jpeg', '.png'):
        continue
    try:
        with Image.open(path) as original:
            image = ImageOps.exif_transpose(original).convert('RGB')
            if image.width / image.height < 1.4:
                rejected.append({'file': path.name, 'reason': 'not-horizontal'})
                continue
            # Preserve all artwork; pad instead of distorting or cropping text.
            image.thumbnail((400, 225), Image.Resampling.LANCZOS)
            canvas = Image.new('RGB', (400, 225), (15, 10, 12))
            canvas.paste(image, ((400-image.width)//2, (225-image.height)//2))
            buf = io.BytesIO()
            canvas.save(buf, format='JPEG', quality=76, optimize=True)
            data = buf.getvalue()
        assets.append({'id': hashlib.sha256(data).hexdigest(), 'keys': [path.stem.lower()],
                       'data': 'data:image/jpeg;base64,' + base64.b64encode(data).decode('ascii')})
    except Exception as exc:
        rejected.append({'file': path.name, 'reason': str(exc)})
output = Path(args.output)
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps({'format':'teamg-artwork-v1', 'assets':assets}, separators=(',', ':')), encoding='utf-8')
output.with_suffix('.report.json').write_text(json.dumps({'prepared':len(assets), 'rejected':rejected}, indent=2), encoding='utf-8')
print(json.dumps({'prepared':len(assets), 'rejected':len(rejected), 'bundleBytes':output.stat().st_size}))
