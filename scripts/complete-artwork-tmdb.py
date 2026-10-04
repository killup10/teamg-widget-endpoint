"""Resolve missing movies with official TMDB API; ambiguous matches stay pending."""
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
from PIL import Image, ImageOps

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
    return re.sub('[^a-z0-9]', '', unicodedata.normalize('NFKD', title).encode('ascii', 'ignore').decode().lower())

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--pending', default='.private-artwork/pending.json')
    p.add_argument('--token-file', default='.private-artwork/tmdb-token.txt')
    p.add_argument('--output', default='.private-artwork/tmdb-covers.json')
    p.add_argument('--queries', default='.private-artwork/title-queries.json')
    args = p.parse_args()
    token = Path(args.token_file).read_text(encoding='utf-8-sig').strip()
    if not token: raise SystemExit('Falta el token TMDB')
    queries_path = Path(args.queries)
    queries = json.loads(queries_path.read_text(encoding='utf-8')) if queries_path.exists() else {}
    folder = Path('.private-artwork/tmdb-cache'); folder.mkdir(parents=True, exist_ok=True)
    def request(url, auth=False):
        headers = {'User-Agent':'TeamG-Artwork/1.0'}
        if auth: headers['Authorization'] = 'Bearer ' + token
        for attempt in range(4):
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=25) as r:
                    return r.read()
            except urllib.error.HTTPError as exc:
                if exc.code in (401,403): raise SystemExit('TMDB rechazó la autenticación; revisa el token')
                if exc.code != 429 and exc.code < 500: raise
                if attempt == 3: raise
                time.sleep(min(30, int(exc.headers.get('Retry-After', 2 ** attempt))))
    pending = json.loads(Path(args.pending).read_text(encoding='utf-8-sig'))
    assets, unresolved, decisions, seen = [], [], [], set()
    for item in pending:
        title, year, key = identity(item['name'])
        if key in seen: continue
        seen.add(key)
        query_title = re.sub(r'\s+(?:SUSPENSO|TERROR|COMEDIA|ROMANCE)\s*$', '', title, flags=re.I).strip()
        reviewed_query = queries.get(item['name'])
        if reviewed_query:
            query_title = reviewed_query['query']
            year = reviewed_query.get('year',year)
        params = {'query':query_title,'language':'es-ES','include_adult':'false'}
        if year: params['primary_release_year'] = year
        cache = folder / (hashlib.sha256((query_title + year).encode()).hexdigest() + '.json')
        try:
            if cache.exists(): results = json.loads(cache.read_text())
            else:
                results = json.loads(request('https://api.themoviedb.org/3/search/movie?' + urllib.parse.urlencode(params), True))
                cache.write_text(json.dumps(results), encoding='utf-8')
            matches = [r for r in results.get('results', [])
                       if normalized(query_title) in (normalized(r.get('title','')), normalized(r.get('original_title','')))
                       and (not year or r.get('release_date','')[:4] == year)]
            if not matches:
                for candidate in results.get('results', [])[:5]:
                    if year and candidate.get('release_date','')[:4] != year: continue
                    details_cache = folder / ('details-' + str(candidate['id']) + '.json')
                    if details_cache.exists(): details = json.loads(details_cache.read_text(encoding='utf-8'))
                    else:
                        details = json.loads(request('https://api.themoviedb.org/3/movie/' + str(candidate['id']) + '?append_to_response=alternative_titles,translations', True))
                        details_cache.write_text(json.dumps(details),encoding='utf-8')
                    aliases = [r.get('title','') for r in details.get('alternative_titles',{}).get('titles',[])]
                    aliases.extend(r.get('data',{}).get('title','') for r in details.get('translations',{}).get('translations',[]))
                    if normalized(query_title) in [normalized(a) for a in aliases]: matches.append(candidate)
            if len(matches) != 1 or not (matches[0].get('backdrop_path') or matches[0].get('poster_path')):
                unresolved.append({'name':item['name'],'reason':'ambiguous-or-no-image','candidates':[{'id':r['id'],'title':r.get('title'),'date':r.get('release_date')} for r in results.get('results',[])[:5]]})
                continue
            movie = matches[0]
            jpg = folder / (str(movie['id']) + '.jpg')
            if not jpg.exists():
                config = json.loads(request('https://api.themoviedb.org/3/configuration', True))['images']
                backdrop = bool(movie.get('backdrop_path'))
                sizes = config['backdrop_sizes' if backdrop else 'poster_sizes']
                preferred = 'w780' if backdrop else 'w342'
                size = preferred if preferred in sizes else sizes[0]
                raw = request(config['secure_base_url'] + size + (movie.get('backdrop_path') or movie['poster_path']))
                with Image.open(io.BytesIO(raw)) as original:
                    image = ImageOps.exif_transpose(original).convert('RGB')
                    image.thumbnail((400,225), Image.Resampling.LANCZOS)
                    canvas = Image.new('RGB',(400,225),(15,10,12))
                    canvas.paste(image,((400-image.width)//2,(225-image.height)//2))
                    canvas.save(jpg, quality=76, optimize=True)
            data = jpg.read_bytes()
            assets.append({'id':hashlib.sha256(data).hexdigest(),'keys':[key],'data':'data:image/jpeg;base64,'+base64.b64encode(data).decode()})
            decisions.append({'name':item['name'],'tmdbId':movie['id'],'title':movie['title'],'year':year,'imageType':'backdrop' if movie.get('backdrop_path') else 'poster'})
        except (OSError, ValueError) as exc:
            # Do not include exception URLs or credential headers in the report.
            unresolved.append({'name':item['name'],'reason':type(exc).__name__})
        if len(seen) % 10 == 0: print(json.dumps({'checked':len(seen),'prepared':len(assets),'pending':len(unresolved)}),flush=True)
    out = Path(args.output)
    out.write_text(json.dumps({'format':'teamg-artwork-v1','assets':assets},separators=(',',':')),encoding='utf-8')
    out.with_suffix('.report.json').write_text(json.dumps({'decisions':decisions,'unresolved':unresolved},ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'prepared':len(assets),'unresolved':len(unresolved)}))

if __name__ == '__main__': main()
