"""Recover punctuation aliases and the old bot's documented last-comma bug."""
import importlib.util
import json
import re
from pathlib import Path

spec = importlib.util.spec_from_file_location('resolver', Path(__file__).with_name('complete-artwork-tmdb.py'))
resolver = importlib.util.module_from_spec(spec); spec.loader.exec_module(resolver)
bundle = json.loads(Path('.private-artwork/local-covers.json').read_text(encoding='utf-8'))
pending = json.loads(Path('.private-artwork/pending.json').read_text(encoding='utf-8'))
norm = lambda s: re.sub('[^a-z0-9]', '', s.lower())
index = {}
for asset in bundle['assets']:
    for key in asset['keys']:
        index.setdefault(norm(key), []).append(asset)
accepted, unresolved = [], []
for item in pending:
    raw = item['name']
    _, _, output_key = resolver.identity(raw)
    variants = [('punctuation', output_key)]
    if ',' in raw:
        variants.append(('old-bot-last-comma', resolver.identity(raw.rsplit(',',1)[1])[2]))
    # The old generator retained an unparenthesized year, then appended it again.
    bare = re.search(r'\b((?:19|20)\d{2})\s*$', raw)
    if bare and not re.search(r'[\(\[]\s*(?:19|20)\d{2}',raw):
        variants.append(('old-bot-duplicate-year',output_key + '_' + bare.group(1)))
    candidates = {}
    for reason, variant in variants:
        for asset in index.get(norm(variant), []):
            candidates[asset['id']] = (asset,reason)
    if len(candidates) == 1:
        asset,reason = next(iter(candidates.values()))
        accepted.append({'name':raw,'key':output_key,'source':asset['keys'][0],'reason':reason,'asset':asset})
    else:
        unresolved.append(item)
out = {'format':'teamg-artwork-v1','assets':[dict(row['asset'],keys=[row['key']]) for row in accepted]}
Path('.private-artwork/reconciled-covers.json').write_text(json.dumps(out,separators=(',',':')),encoding='utf-8')
report = [{k:v for k,v in row.items() if k != 'asset'} for row in accepted]
Path('.private-artwork/reconciled-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'accepted':report,'unresolved':len(unresolved)},ensure_ascii=False))
