"""Resolve Cine 4K movies with official TMDB API and 4K UHD badge."""
import argparse
import base64
import hashlib
import io
import json
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

def identity(raw):
    match = re.search(r'[\(\[]\s*((?:19|20)\d{2})\s*[\)\]]', raw)
    year = match.group(1) if match else ''
    title = re.sub(r'\[.*?\]|\(.*?\)', ' ', raw)
    title = re.sub(r'\b(4k|uhd|fhd|hd|1080p|720p|latino|castellano|subtitulado|dual|h264|h265|hevc|x264|x265)\b', ' ', title, flags=re.I)
    title = re.sub(r'[-_/|]+', ' ', title)
    title = re.sub(r'\s+', ' ', title).strip()
    filename = re.sub(r'[^a-zA-Z0-9_\-]', '_', title)[:60].lower() + ('_' + year if year else '')
    return title, year, filename

def normalized(title):
    return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFKD', title).encode('ascii', 'ignore').decode().lower())

def draw_4k_badge(canvas):
    # Top-right 4K UHD badge
    badge_layer = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    bdraw = ImageDraw.Draw(badge_layer)
    x2 = canvas.width - 8
    y1 = 8
    w = 54
    h = 19
    x1 = x2 - w
    y2 = y1 + h
    bdraw.rounded_rectangle([x1, y1, x2, y2], radius=3, fill=(10, 10, 15, 230), outline=(230, 185, 45, 255), width=1)
    try:
        font = ImageFont.truetype('arialbd.ttf', 11)
    except Exception:
        font = ImageFont.load_default()
    bdraw.text((x1 + 6, y1 + 3), "4K UHD", fill=(255, 215, 0, 255), font=font)
    return Image.alpha_composite(canvas, badge_layer)

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--pending', default='.private-artwork/pending_4k.json')
    p.add_argument('--token-file', default='.private-artwork/tmdb-token.txt')
    p.add_argument('--output', default='.private-artwork/covers_4k.json')
    args = p.parse_args()

    token = Path(args.token_file).read_text(encoding='utf-8-sig').strip()
    if not token:
        raise SystemExit('Falta el token TMDB')

    cache_folder = Path('.private-artwork/tmdb-cache')
    cache_folder.mkdir(parents=True, exist_ok=True)
    img_folder = Path('.private-artwork/covers_4k_imgs')
    img_folder.mkdir(parents=True, exist_ok=True)

    def request(url, auth=False):
        headers = {'User-Agent': 'TeamG-Artwork/1.0'}
        if auth:
            headers['Authorization'] = 'Bearer ' + token
        for attempt in range(4):
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=25) as r:
                    return r.read()
            except urllib.error.HTTPError as exc:
                if exc.code in (401, 403):
                    raise SystemExit('TMDB rechazó la autenticación; revisa el token')
                if exc.code != 429 and exc.code < 500:
                    raise
                if attempt == 3:
                    raise
                time.sleep(min(30, int(exc.headers.get('Retry-After', 2 ** attempt))))

    pending = json.loads(Path(args.pending).read_text(encoding='utf-8-sig'))
    assets, unresolved, decisions = [], [], []
    seen = {}

    print(f"Resolving {len(pending)} titles from TMDB...")
    t0 = time.time()

    for idx, item in enumerate(pending):
        title, year, key = identity(item['name'])
        query_title = re.sub(r'\s+(?:SUSPENSO|TERROR|COMEDIA|ROMANCE|ACCION|DRAMA|FAMILIAR)\s*$', '', title, flags=re.I).strip()
        
        # If already seen and generated, reuse asset
        if key in seen:
            decisions.append({'name': item['name'], 'tmdbId': seen[key]['tmdbId'], 'title': seen[key]['title'], 'reused': True})
            continue

        params = {'query': query_title, 'language': 'es-ES', 'include_adult': 'false'}
        if year:
            params['primary_release_year'] = year

        cache = cache_folder / (hashlib.sha256((query_title + year).encode()).hexdigest() + '.json')
        try:
            if cache.exists():
                results = json.loads(cache.read_text(encoding='utf-8'))
            else:
                results = json.loads(request('https://api.themoviedb.org/3/search/movie?' + urllib.parse.urlencode(params), True))
                cache.write_text(json.dumps(results), encoding='utf-8')

            matches = [r for r in results.get('results', [])
                       if normalized(query_title) in (normalized(r.get('title', '')), normalized(r.get('original_title', '')))
                       and (not year or r.get('release_date', '')[:4] == year)]

            if not matches:
                for candidate in results.get('results', [])[:5]:
                    if year and candidate.get('release_date', '')[:4] != year:
                        continue
                    details_cache = cache_folder / ('details-' + str(candidate['id']) + '.json')
                    if details_cache.exists():
                        details = json.loads(details_cache.read_text(encoding='utf-8'))
                    else:
                        details = json.loads(request('https://api.themoviedb.org/3/movie/' + str(candidate['id']) + '?append_to_response=alternative_titles,translations', True))
                        details_cache.write_text(json.dumps(details), encoding='utf-8')
                    aliases = [r.get('title', '') for r in details.get('alternative_titles', {}).get('titles', [])]
                    aliases.extend(r.get('data', {}).get('title', '') for r in details.get('translations', {}).get('translations', []))
                    if normalized(query_title) in [normalized(a) for a in aliases]:
                        matches.append(candidate)

            if len(matches) != 1 or not (matches[0].get('backdrop_path') or matches[0].get('poster_path')):
                unresolved.append({'name': item['name'], 'reason': 'ambiguous-or-no-image', 'candidates': [{'id': r['id'], 'title': r.get('title'), 'date': r.get('release_date')} for r in results.get('results', [])[:5]]})
                continue

            movie = matches[0]
            images_cache = cache_folder / ('images-' + str(movie['id']) + '.json')
            if images_cache.exists():
                images = json.loads(images_cache.read_text(encoding='utf-8'))
            else:
                images = json.loads(request('https://api.themoviedb.org/3/movie/' + str(movie['id']) + '/images', True))
                images_cache.write_text(json.dumps(images), encoding='utf-8')

            backdrops = images.get('backdrops', [])
            logos = [l for l in images.get('logos', []) if l.get('file_path', '').lower().endswith(('.png', '.jpg'))]
            posters = images.get('posters', [])

            es_bds = [b for b in backdrops if b.get('iso_639_1') == 'es']
            en_bds = [b for b in backdrops if b.get('iso_639_1') == 'en']

            es_logos = [l for l in logos if l.get('iso_639_1') == 'es']
            en_logos = [l for l in logos if l.get('iso_639_1') == 'en']
            best_logo = es_logos[0]['file_path'] if es_logos else (en_logos[0]['file_path'] if en_logos else (logos[0]['file_path'] if logos else None))

            best_bd = backdrops[0]['file_path'] if backdrops else movie.get('backdrop_path')
            es_posters = [p for p in posters if p.get('iso_639_1') == 'es']
            best_poster = es_posters[0]['file_path'] if es_posters else (movie.get('poster_path') or (posters[0]['file_path'] if posters else None))

            selected_bg = None
            selected_logo = None
            image_type = 'backdrop'

            if es_bds:
                selected_bg = es_bds[0]['file_path']
                image_type = 'backdrop_es'
            elif en_bds and not best_logo:
                selected_bg = en_bds[0]['file_path']
                image_type = 'backdrop_en'
            elif best_bd and best_logo:
                selected_bg = best_bd
                selected_logo = best_logo
                image_type = 'backdrop_with_logo'
            elif en_bds:
                selected_bg = en_bds[0]['file_path']
                image_type = 'backdrop_en'
            elif best_poster:
                selected_bg = best_poster
                image_type = 'poster'
            elif best_bd:
                selected_bg = best_bd
                image_type = 'backdrop_raw'

            if not selected_bg:
                unresolved.append({'name': item['name'], 'reason': 'no-usable-image'})
                continue

            jpg = img_folder / (str(movie['id']) + '_4k.jpg')
            if not jpg.exists():
                bg_size = 'w780' if image_type != 'poster' else 'w342'
                bg_raw = request('https://image.tmdb.org/t/p/' + bg_size + selected_bg)
                with Image.open(io.BytesIO(bg_raw)) as orig_bg:
                    bg = ImageOps.exif_transpose(orig_bg).convert('RGBA')
                    bg.thumbnail((400, 225), Image.Resampling.LANCZOS)
                    canvas = Image.new('RGBA', (400, 225), (15, 10, 12, 255))
                    canvas.paste(bg, ((400 - bg.width) // 2, (225 - bg.height) // 2))

                    if selected_logo:
                        try:
                            logo_raw = request('https://image.tmdb.org/t/p/w500' + selected_logo)
                            with Image.open(io.BytesIO(logo_raw)) as orig_logo:
                                logo = ImageOps.exif_transpose(orig_logo).convert('RGBA')
                                max_w = int(canvas.width * 0.72)
                                max_h = int(canvas.height * 0.44)
                                logo.thumbnail((max_w, max_h), Image.Resampling.LANCZOS)
                                x = (canvas.width - logo.width) // 2
                                y = canvas.height - logo.height - 18
                                canvas.paste(logo, (x, y), mask=logo)
                        except Exception:
                            pass

                    # Apply 4K UHD badge!
                    canvas = draw_4k_badge(canvas)

                    final_rgb = canvas.convert('RGB')
                    final_rgb.save(jpg, format='JPEG', quality=79, optimize=True)

            data = jpg.read_bytes()
            b64_str = 'data:image/jpeg;base64,' + base64.b64encode(data).decode('ascii')
            asset_entry = {'id': hashlib.sha256(data).hexdigest(), 'key': key, 'data': b64_str}
            assets.append(asset_entry)
            seen[key] = {'tmdbId': movie['id'], 'title': movie['title'], 'asset': asset_entry}
            decisions.append({'name': item['name'], 'tmdbId': movie['id'], 'title': movie['title'], 'year': year, 'imageType': image_type})

        except Exception as exc:
            unresolved.append({'name': item['name'], 'reason': str(exc)})

        if (idx + 1) % 50 == 0 or (idx + 1) == len(pending):
            print(f"Progress: {idx + 1}/{len(pending)} | Prepared: {len(assets)} | Unresolved: {len(unresolved)} | Elapsed: {int(time.time() - t0)}s", flush=True)

    out = Path(args.output)
    out.write_text(json.dumps({'format': 'teamg-artwork-v1', 'assets': assets}, separators=(',', ':')), encoding='utf-8')
    out.with_suffix('.report.json').write_text(json.dumps({'decisions': decisions, 'unresolved': unresolved}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"\nFINISHED! Prepared: {len(assets)}, Unresolved: {len(unresolved)}")

if __name__ == '__main__':
    main()
