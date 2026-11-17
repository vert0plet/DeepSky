"""Fetch cached Gaia DR3 cones from the official AIP TAP mirror; merge with HYG.

Usage: build-deep-stars.py /outside/repo/cache-directory
No user locations are sent: cone centres are the public catalogue coordinates.
Gaia G magnitudes are retained as G, not converted to Johnson V.
"""
import concurrent.futures
import hashlib
import json
import math
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

root = Path(__file__).resolve().parent.parent
cache = Path(sys.argv[1]); cache.mkdir(parents=True, exist_ok=True)
catalogue = json.loads((root / 'dist/data/catalog.json').read_text())
endpoint = 'https://gaia.aip.de/tap/sync'
ns = {'v': 'http://www.ivoa.net/xml/VOTable/v1.3'}

def fetch(group):
    cones = ' OR '.join(f"1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',{o['ra']},{o['dec']},0.4))" for o in group)
    query = ('SELECT TOP 10000 source_id,ra,dec,pmra,pmdec,phot_g_mean_mag '
             'FROM gaiadr3.gaia_source WHERE phot_g_mean_mag > 9.5 AND phot_g_mean_mag <= 14 '
             'AND (' + cones + ')')
    path = cache / (hashlib.sha256(query.encode()).hexdigest()[:16] + '.xml')
    if not path.exists():
        data = urllib.parse.urlencode(dict(REQUEST='doQuery', LANG='ADQL', FORMAT='votable', MAXREC=10000, QUERY=query)).encode()
        request = urllib.request.Request(endpoint, data=data, headers={'User-Agent': 'DeepSky-offline-catalogue/0.3'})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(request, timeout=100) as response:
                    content = response.read()
                break
            except urllib.error.HTTPError as error:
                message = error.read().decode(errors='replace')
                temporary = error.code in (429,500,502,503,504) or (error.code == 400 and 'statement timeout' in message)
                if not temporary or attempt == 2:
                    raise RuntimeError(f'{group[0]["id"]}: HTTP {error.code}: {message[:500]}') from error
                time.sleep(2*(attempt+1))
        document = ET.fromstring(content)
        for status in document.findall('.//v:INFO[@name="QUERY_STATUS"]', ns):
            if status.attrib.get('value') != 'OK':
                raise ValueError(ET.tostring(status, encoding='unicode'))
        path.write_bytes(content)
    document = ET.parse(path)
    rows = [[cell.text for cell in row.findall('v:TD', ns)] for row in document.findall('.//v:TABLEDATA/v:TR', ns)]
    if len(rows) >= 10000:
        raise ValueError('Cone batch reached the row cap; split into smaller batches')
    print(f"{group[0]['id']} … {group[-1]['id']}: {len(rows)} rows", flush=True)
    return rows

def epoch2000(ra, dec, pmra, pmdec):
    a, d = math.radians(ra), math.radians(dec)
    direction = [math.cos(a)*math.cos(d), math.sin(a)*math.cos(d), math.sin(d)]
    east, north = [-math.sin(a), math.cos(a), 0], [-math.cos(a)*math.sin(d), -math.sin(a)*math.sin(d), math.cos(d)]
    scale = math.pi / (180*3600000) * -16
    v = [direction[i] + scale * (pmra*east[i] + pmdec*north[i]) for i in range(3)]
    norm = math.sqrt(sum(x*x for x in v))
    return math.degrees(math.atan2(v[1],v[0])) % 360, math.degrees(math.asin(v[2]/norm))

stars_path = root / 'dist/data/sky-stars.json'
stars = [s for s in json.loads(stars_path.read_text()) if len(s) < 7 or s[6] != 'G']
# HYG/Gaia positional crossmatch at 3 arcsec in 3D cells, including polar/RA wrap.
cell_size = math.radians(3/3600)
cells = {}
def vector(ra, dec):
    a,d = math.radians(ra),math.radians(dec)
    return math.cos(a)*math.cos(d),math.sin(a)*math.cos(d),math.sin(d)
def cell(v): return tuple(math.floor(x/cell_size) for x in v)
for s in stars:
    v = vector(s[0],s[1]); cells.setdefault(cell(v), []).append(v)
def in_hyg(v):
    key = cell(v)
    for x in range(-1,2):
        for y in range(-1,2):
            for z in range(-1,2):
                for other in cells.get((key[0]+x,key[1]+y,key[2]+z),[]):
                    if sum((a-b)**2 for a,b in zip(v,other)) < cell_size**2:
                        return True
    return False

groups = [catalogue[i:i+1] for i in range(0,len(catalogue),1)]
unique = {}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    for rows in pool.map(fetch,groups):
        for row in rows:
            source_id,ra,dec,pmra,pmdec,g = row
            ra,dec = epoch2000(float(ra),float(dec),float(pmra or 0),float(pmdec or 0))
            if not in_hyg(vector(ra,dec)):
                unique[source_id] = [round(ra,5),round(dec,5),round(float(g),2),'',0,'G'+source_id,'G']
stars += list(unique.values()); stars.sort(key=lambda s:s[2])
stars_path.write_text(json.dumps(stars,ensure_ascii=False,separators=(',',':')))
sources_path = root / 'dist/data/sources.json'
sources = [s for s in json.loads(sources_path.read_text()) if s.get('id') != 'gaia-deep-fields']
sources.append(dict(id='gaia-deep-fields',title='Gaia DR3 — deep target fields',author='ESA / Gaia / DPAC; Gaia@AIP TAP mirror',
                    url='https://gaia.aip.de/metadata/gaiadr3/gaia_source/',files=['sky-stars.json'],count=len(unique),snapshot='2026-11-06',
                    changes='G=9.5–14 within 0.4 degree of the 306 catalogue targets; Unique source IDs retained. '
                    'Linear tangent-plane proper-motion propagation from J2016 to J2000; absent proper motions treated as zero. '
                    'Three-arcsecond crossmatch against HYG removed overlaps. Gaia source IDs retained as strings, row column 7 is G. '
                    'G is not Johnson V; magnitude limits describe map detail, not visual detectability.',
                    credit='Data from ESA Gaia, processed by the Gaia Data Processing and Analysis Consortium (DPAC). DPAC funding is provided by national institutions participating in the Gaia Multilateral Agreement.'))
sources_path.write_text(json.dumps(sources,ensure_ascii=False,indent=2)+'\n')
print(f'Added {len(unique):,} Gaia point sources; total {len(stars):,}',flush=True)
