"""Require a real, usable local photo for every catalog entry."""
from pathlib import Path
import hashlib
import json
from PIL import Image, ImageStat

root=Path(__file__).resolve().parent.parent/'dist'
catalog=json.loads((root/'data/catalog.json').read_text())
curated=json.loads((root/'assets/image-credits.json').read_text())
survey=json.loads((root/'assets/survey-credits.json').read_text())
previews=json.loads((root/'assets/preview-credits.json').read_text())
photos={**survey,**curated,**previews}
normalize=lambda name: str(name).upper().replace(' ','').replace('-','')
missing=[]
hashes={}
for obj in catalog:
    keys=[normalize(obj['id'])]+[normalize(a) for a in obj.get('aliases',[])]
    photo=next((photos[k] for k in keys if k in photos),None)
    if not photo:
        missing.append(obj['id'])
        continue
    path=(root/photo['path']).resolve()
    assert path.is_relative_to((root/'assets').resolve()), obj['id']
    assert path.is_file(), f"Missing file: {obj['id']} {path}"
    with Image.open(path) as image:
        assert image.width>=320 and image.height>=200, f"Placeholder-sized photo: {obj['id']}"
        stat=ImageStat.Stat(image.convert('L'))
        assert stat.stddev[0]>2, f"Blank photo: {obj['id']}"
        image.verify()
    digest=hashlib.sha256(path.read_bytes()).hexdigest()
    assert digest not in hashes, f"Same image for {obj['id']} and {hashes.get(digest)}"
    hashes[digest]=obj['id']
    assert photo.get('source') and photo.get('credit') and photo.get('licenseUrl'), obj['id']
    if photo.get('preview'):
        assert image.size==(640,360), obj['id']
    if photo.get('kind')=='survey':
        assert abs(photo['ra']-obj['ra'])<1e-5, f"Wrong RA: {obj['id']}"
        assert abs(photo['dec']-obj['dec'])<1e-5, f"Wrong Dec: {obj['id']}"
        assert 0<photo['fov']<=7, f"Invalid field: {obj['id']}"
assert not missing, f"No photos for {len(missing)} objects: {', '.join(missing)}"
print(f'PASS: {len(catalog)} / {len(catalog)} objects have unique local photos, valid dimensions, contrast, sources and coordinates.')
