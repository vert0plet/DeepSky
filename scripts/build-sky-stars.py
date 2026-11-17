"""Build the offline planetarium selection from the attributed HYG 4.1 snapshot.

Pass a local hygdata_v41.csv. The source is kept outside the application repo.
This is a magnitude-limited HYG selection, not a complete deep star survey.
"""
import csv
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
rows = []
with Path(sys.argv[1]).open() as source:
    for star in csv.DictReader(source):
        if star['id'] == '0' or not star['mag'] or float(star['mag']) > 11.5:
            continue
        magnitude = float(star['mag'])
        name = star['proper'] or (star['bf'].strip() if magnitude <= 6.5 else '')
        rows.append([round(float(star['ra']) * 15, 5), round(float(star['dec']), 5),
                     round(magnitude, 2), name, int(star['hip'] or 0), int(star['id'])])
rows.sort(key=lambda row: row[2])
(root / 'dist/data/sky-stars.json').write_text(json.dumps(rows, ensure_ascii=False, separators=(',', ':')))
sources_path = root / 'dist/data/sources.json'
sources = json.loads(sources_path.read_text())
sources = [source for source in sources if source.get('id') != 'hyg-planetarium']
sources.append(dict(id='hyg-planetarium', title='HYG Database 4.1 — planetarium selection',
                    author='David Nash / Astronomy Nexus', url='https://github.com/astronexus/HYG-Database',
                    license='CC BY-SA 4.0', licenseUrl='https://creativecommons.org/licenses/by-sa/4.0/',
                    files=['sky-stars.json'], count=len(rows), snapshot='2026-11-06',
                    changes='Sun removed; HYG entries with magnitude <= 11.5, across the entire sky. '
                    'Not complete to this magnitude. J2000 positions rounded to 0.00001 degree; '
                    'proper motion not propagated. Columns: RA degrees, Dec degrees, magnitude, label, HIP, HYG ID.'))
sources_path.write_text(json.dumps(sources, ensure_ascii=False, indent=2) + '\n')
print(f'{len(rows):,} HYG stars; {len(rows) - 25158:,} more entries than finder charts')
