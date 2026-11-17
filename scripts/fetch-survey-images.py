#!/usr/bin/env python3
"""Cache actual, coordinate-centered DSS photographs for the observing catalog.

Requires Pillow and NumPy. No API key, generated imagery, star-map substitution, or runtime
network dependency is used. This personal, noncommercial project acknowledges DSS
under https://archive.stsci.edu/dss/faq.html. Commercial reuse needs a DSS license.

The CDS HiPS2FITS primary and its two documented mirrors were probed with bounded
30-second requests and were unreachable from this development host. This script
uses the documented NASA SkyView batch fallback, which reprojects the actual DSS2
photographic plates. See:
https://skyview.gsfc.nasa.gov/current/docs/batchpage.html
https://skyview.gsfc.nasa.gov/current/docs/skyviewinajar.html

RGB is SkyView's standard composition of DSS2 IR, Red, and Blue plates. When a
three-band cutout is unavailable, a genuine monochrome DSS2 Red cutout is used
and recorded honestly in the manifest. Existing curated ESA/Hubble/ESO photos
are retained. Per-channel sky-background subtraction and a documented asinh
display stretch remove photographic plate background casts without generating
spatial content. Original cutouts are cached outside the repository. The script
is resumable, validates files, and atomically persists the manifest after every
completed photograph.
"""

import argparse
import concurrent.futures
import hashlib
import io
import json
import math
from pathlib import Path
import re
import time
import urllib.parse
import urllib.request

import numpy as np
from PIL import Image, ImageStat


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "dist/assets/survey"
MANIFEST = ROOT / "dist/assets/survey-credits.json"
CACHE = ROOT.parent / "survey-originals"
ENDPOINT = "https://skyview.gsfc.nasa.gov/current/cgi/pskcall"
WIDTH, HEIGHT = 640, 400
TIMEOUT = 30
HEADERS = {"User-Agent": "DeepSky personal noncommercial observing atlas / Mozilla/5.0"}
PRIORITY = ["NGC598", "NGC185", "NGC457", "NGC7654", "NGC581"]


def normalized(value):
    value = re.sub(r"\s+", "", str(value).upper())
    match = re.fullmatch(r"(NGC|IC|M)0*(\d+)", value)
    return match.group(1) + str(int(match.group(2))) if match else value


def field_of_view(obj):
    kind = obj["type"]
    major = obj.get("major")
    major = major if isinstance(major, (int, float)) and major > 0 else None
    if kind in ("quasar", "special"):
        return 0.12
    minimum = {"galaxy": 0.12, "open": 0.2, "globular": 0.2,
               "planetary": 0.035, "emission": 0.15, "reflection": 0.15,
               "dark": 0.15, "snr": 0.15}.get(kind, 0.15)
    default = 0.25 if kind in ("galaxy", "planetary") else 0.5
    return round(min(7.0, max(minimum, major * 2.2 / 60 if major else default)), 6)


def valid_image(raw):
    image = Image.open(io.BytesIO(raw))
    image.load()
    if image.size != (WIDTH, HEIGHT):
        raise ValueError(f"Unexpected image dimensions {image.size}; possible service placeholder")
    image = image.convert("RGB")
    stats = ImageStat.Stat(image)
    if max(stats.stddev) < 1.0:
        raise ValueError("Blank or near-constant image")
    if image.getbbox() is None:
        raise ValueError("Empty black image")
    return image


def request(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=TIMEOUT) as response:
        raw = response.read(8 * 1024 * 1024)
        return raw


def query_url(obj, fov, rgb):
    params = {
        "Position": f"{obj['ra']:.6f},{obj['dec']:.6f}",
        "Survey": "DSS2 IR,DSS2 Red,DSS2 Blue" if rgb else "DSS2 Red",
        "Pixels": f"{WIDTH},{HEIGHT}",
        "Size": f"{fov:.6f},{fov * HEIGHT / WIDTH:.6f}",
        "Return": "filename" if rgb else "JPEG",
        "Coordinates": "J2000", "Projection": "Tan", "Rotation": "0",
    }
    if rgb:
        params["RGB"] = "true"
    return ENDPOINT + "?" + urllib.parse.urlencode(params)


def retrieve(obj):
    key = obj["id"]
    if not (math.isfinite(obj["ra"]) and math.isfinite(obj["dec"])):
        raise ValueError(f"Invalid coordinates for {key}")
    fov = field_of_view(obj)
    errors = []
    # A single retry of RGB, then a bounded monochrome fallback.
    for attempt, rgb in enumerate((True, True, False)):
        query = query_url(obj, fov, rgb)
        try:
            raw = request(query)
            download = query
            if rgb:
                stem = raw.decode("ascii").strip()
                if not re.fullmatch(r"skv[\w.-]+", stem):
                    raise ValueError("SkyView did not return a valid RGB filename stem")
                download = "https://skyview.gsfc.nasa.gov/tempspace/fits/" + stem + "_rgb.jpg"
                raw = request(download)
            image = valid_image(raw)
            buffer = io.BytesIO()
            image.save(buffer, "JPEG", quality=88, optimize=True)
            encoded = buffer.getvalue()
            filename = re.sub(r"[^a-z0-9]+", "", key.lower()) + ".jpg"
            temporary = OUT / (filename + ".tmp")
            temporary.write_bytes(encoded)
            temporary.replace(OUT / filename)
            return key, {
                "path": "assets/survey/" + filename,
                "source": query,
                "downloadUrl": download,
                "credit": "DSS2 / STScI · POSS-II / UKST · NASA SkyView",
                "license": "DSS: некоммерческое использование",
                "licenseUrl": "https://archive.stsci.edu/dss/faq.html",
                "copyrightUrl": "https://archive.stsci.edu/dss/copyright.html",
                "acknowledgmentUrl": "https://archive.stsci.edu/dss/acknowledging.html",
                "kind": "survey", "survey": "DSS2",
                "bands": "IR / Red / Blue" if rgb else "Red (monochrome)",
                "fov": fov, "fovHeight": round(fov * HEIGHT / WIDTH, 6),
                "ra": obj["ra"], "dec": obj["dec"],
                "width": WIDTH, "height": HEIGHT,
                "orientation": "North up; east left; equatorial J2000; TAN projection",
                "changes": "Coordinate-centered DSS2 cutout; standard SkyView RGB plate composition and JPEG compression." if rgb else "Coordinate-centered monochrome DSS2 Red cutout; JPEG compression.",
                "copyright": "DSS photographic plates: Caltech/POSS-II, UK SERC/PPARC/AAO and AURA/STScI as applicable. Noncommercial use; commercial applications require a separate license.",
                "sizeBytes": len(encoded),
                "sha256": hashlib.sha256(encoded).hexdigest(),
            }
        except Exception as exc:
            errors.append(f"{'RGB' if rgb else 'Red'} attempt {attempt + 1}: {exc}")
            if attempt == 0:
                time.sleep(0.7)
    raise RuntimeError(f"{key}: " + "; ".join(errors))


def persist(data):
    tmp = MANIFEST.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(MANIFEST)


def normalize_existing(manifest):
    """Build display images deterministically from the unmodified cached source.

    Photographic plates have different sky zero points in each band. Removing
    those backgrounds is an astronomical display transformation, not generated
    image content or photometric calibration. Spatial pixels are unchanged.
    The original source bytes are retained outside both dist and the repository.
    """
    CACHE.mkdir(parents=True, exist_ok=True)
    for key, metadata in manifest.items():
        destination = ROOT / "dist" / metadata["path"]
        source = CACHE / destination.name
        if not source.exists():
            if metadata.get("displayTransform"):
                raise ValueError(f"Missing original cache for already normalized {key}; refusing a second stretch")
            source.write_bytes(destination.read_bytes())
        original = source.read_bytes()
        image = valid_image(original)
        pixels = np.asarray(image, dtype=np.float64)
        black = np.percentile(pixels, 20, axis=(0, 1))
        white = np.percentile(pixels, 99.7, axis=(0, 1))
        pixels = np.clip((pixels - black) / np.maximum(white - black, 1.0), 0.0, 1.0)
        pixels = np.arcsinh(2.0 * pixels) / np.arcsinh(2.0)
        image = Image.fromarray(np.rint(pixels * 255).astype(np.uint8))
        encoded = io.BytesIO()
        image.save(encoded, "JPEG", quality=88, optimize=True)
        data = encoded.getvalue()
        temp = destination.with_suffix(".jpg.tmp")
        temp.write_bytes(data)
        temp.replace(destination)
        metadata["displayTransform"] = {
            "method": "Per-channel photographic sky-background subtraction and asinh display stretch",
            "backgroundPercentile": 20,
            "whitePercentile": 99.7,
            "asinhFactor": 2,
            "blackPoint": [round(float(x), 4) for x in black],
            "whitePoint": [round(float(x), 4) for x in white],
            "originalCachedSha256": hashlib.sha256(original).hexdigest(),
            "originalCachedSizeBytes": len(original),
            "formula": "u=clip((pixel-P20)/(P99.7-P20),0,1); display=255*asinh(2*u)/asinh(2)",
        }
        metadata["changes"] = (
            "Coordinate-centered DSS2 photographic-plate cutout; standard SkyView "
            + ("IR/Red/Blue composition; " if metadata["bands"] == "IR / Red / Blue" else "monochrome Red band; ")
            + "per-channel P20 sky-background subtraction, P99.7 white normalization, "
            "asinh(2*u)/asinh(2) astronomical display stretch and JPEG compression. "
            "Spatial structure retained; display colors are not calibrated true colors or an eyepiece simulation."
        )
        metadata["survey"] = "DSS2" if metadata["bands"] == "IR / Red / Blue" else "DSS2 Red"
        metadata["sizeBytes"] = len(data)
        metadata["sha256"] = hashlib.sha256(data).hexdigest()
        persist(manifest)
    print(f"Display-normalized {len(manifest)} photographs from original cache {CACHE}", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workers", type=int, default=3)
    parser.add_argument("--ids", nargs="*", help="Optional canonical object IDs")
    parser.add_argument("--normalize-only", action="store_true", help="Rebuild display JPEGs from original cache, without network requests")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    catalog = json.loads((ROOT / "dist/data/catalog.json").read_text())
    curated = json.loads((ROOT / "dist/assets/image-credits.json").read_text())
    curated_keys = {normalized(key) for key in curated}
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    if args.normalize_only:
        normalize_existing(manifest)
        return 0
    pending = []
    curated_count = 0
    for obj in catalog:
        aliases = {normalized(value) for value in [obj["id"], obj["name"], *obj.get("aliases", [])]}
        if aliases & curated_keys:
            curated_count += 1
            continue
        if args.ids and obj["id"] not in args.ids:
            continue
        previous = manifest.get(obj["id"])
        if previous:
            try:
                valid_image((ROOT / "dist" / previous["path"]).read_bytes())
                continue
            except Exception:
                pass
        pending.append(obj)
    pending.sort(key=lambda obj: PRIORITY.index(obj["id"]) if obj["id"] in PRIORITY else len(PRIORITY))
    persist(manifest)
    print(f"Catalog {len(catalog)}; curated {curated_count}; cached {len(manifest)}; pending {len(pending)}", flush=True)
    failures = []
    started = time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(3, max(1, args.workers))) as pool:
        futures = {pool.submit(retrieve, obj): obj["id"] for obj in pending}
        for number, future in enumerate(concurrent.futures.as_completed(futures), 1):
            key = futures[future]
            try:
                key, result = future.result()
                manifest[key] = result
                persist(manifest)
                print(f"[{number}/{len(pending)}] {key}: {result['sizeBytes']} bytes; {result['bands']}; cached {len(manifest)}", flush=True)
            except Exception as exc:
                failures.append(key)
                print(f"FAILED {exc}", flush=True)
    print(json.dumps({"cached": len(manifest), "curated": curated_count,
                      "failures": failures, "elapsedSeconds": round(time.monotonic()-started, 1)}, ensure_ascii=False), flush=True)
    normalize_existing(manifest)
    return bool(failures)


if __name__ == "__main__":
    raise SystemExit(main())
