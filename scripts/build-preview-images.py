#!/usr/bin/env python3
"""Build consistent, softly colored DSS2 overview previews for all targets.

These are real photographic plate cutouts, never generated or eyepiece
simulations. Angular fields are adaptive and explicitly recorded rather than
pretending every target is shown at one angular scale. NASA SkyView's documented
batch interface supplies the RGB cutouts (DSS2 IR/Red/Blue), with genuine DSS2 Red
as a bounded fallback. Original source bytes and metadata stay outside checkout.

Requires NumPy and Pillow. Usage:
  python3 scripts/build-preview-images.py --sample
  python3 scripts/build-preview-images.py
  python3 scripts/build-preview-images.py --reprocess --saturation 0.22

References:
https://skyview.gsfc.nasa.gov/current/docs/batchpage.html
https://skyview.gsfc.nasa.gov/current/docs/skyviewinajar.html
https://archive.stsci.edu/dss/faq.html
https://archive.stsci.edu/dss/copyright.html
https://archive.stsci.edu/dss/acknowledging.html
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
from PIL import Image, ImageDraw, ImageStat


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "dist/assets/previews"
MANIFEST = ROOT / "dist/assets/preview-credits.json"
CACHE = ROOT.parent / "overview-originals"
CONTACT = ROOT.parent / "overview-contactsheet.jpg"
ENDPOINT = "https://skyview.gsfc.nasa.gov/current/cgi/pskcall"
WIDTH, HEIGHT = 640, 360
PRIORITY = ["NGC6503", "NGC224", "NGC6205", "NGC650", "NGC6720", "NGC6853"]
HEADERS = {"User-Agent": "DeepSky personal noncommercial observing atlas / Mozilla/5.0"}


def geometry(obj):
    major = obj.get("major")
    valid_major = isinstance(major, (int, float)) and math.isfinite(major) and major > 0
    size = float(major) if valid_major else 3.0
    fraction = min(0.55, max(0.16, 0.12 + 0.055 * math.log2(size + 1)))
    if obj["type"] in ("special", "quasar") or not valid_major:
        fov = 0.3
    else:
        fov = min(420.0, max(12.0, size / fraction)) / 60
    return round(fov, 6), fraction, float(major) if valid_major else None


def validated(raw):
    image = Image.open(io.BytesIO(raw))
    image.load()
    if image.size != (WIDTH, HEIGHT):
        raise ValueError(f"Unexpected image dimensions {image.size}; possible service error thumbnail")
    image = image.convert("RGB")
    if max(ImageStat.Stat(image).stddev) < 1 or image.getbbox() is None:
        raise ValueError("Blank or constant photograph")
    return image


def request(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=30) as response:
        return response.read(8 * 1024 * 1024)


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


def original(obj, fov):
    filename = re.sub(r"[^a-z0-9]+", "", obj["id"].lower())
    cache_key = f"{filename}-{fov:.6f}-{WIDTH}x{HEIGHT}"
    raw_path = CACHE / (cache_key + ".jpg")
    meta_path = CACHE / (cache_key + ".json")
    if raw_path.exists() and meta_path.exists():
        try:
            raw = raw_path.read_bytes()
            validated(raw)
            metadata = json.loads(meta_path.read_text())
            if metadata["ra"] == obj["ra"] and metadata["dec"] == obj["dec"]:
                return raw, metadata
        except Exception:
            pass
    errors = []
    for attempt, rgb in enumerate((True, True, False)):
        query = query_url(obj, fov, rgb)
        try:
            raw = request(query)
            download = query
            if rgb:
                stem = raw.decode("ascii").strip()
                if not re.fullmatch(r"skv[\w.-]+", stem):
                    raise ValueError("SkyView returned an invalid RGB filename stem")
                download = "https://skyview.gsfc.nasa.gov/tempspace/fits/" + stem + "_rgb.jpg"
                raw = request(download)
            validated(raw)
            metadata = {
                "source": query, "downloadUrl": download,
                "bands": "IR / Red / Blue" if rgb else "Red (monochrome)",
                "survey": "DSS2" if rgb else "DSS2 Red",
                "ra": obj["ra"], "dec": obj["dec"], "fov": fov,
            }
            temp = raw_path.with_suffix(".jpg.tmp")
            temp.write_bytes(raw)
            temp.replace(raw_path)
            meta_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
            return raw, metadata
        except Exception as exc:
            errors.append(f"{'RGB' if rgb else 'Red'} attempt {attempt + 1}: {exc}")
            if attempt == 0:
                time.sleep(0.5)
    raise RuntimeError(obj["id"] + ": " + "; ".join(errors))


def preview(obj, saturation, brightness, asinh_factor):
    fov, fraction, major = geometry(obj)
    raw, source = original(obj, fov)
    pixels = np.asarray(validated(raw), dtype=np.float64)
    black = np.percentile(pixels, 20, axis=(0, 1))
    white = np.percentile(pixels, 99.7, axis=(0, 1))
    pixels = np.clip((pixels - black) / np.maximum(white - black, 1.0), 0, 1)
    pixels = np.arcsinh(pixels * asinh_factor) / np.arcsinh(asinh_factor)
    luminance = np.sum(pixels * np.array([0.2126, 0.7152, 0.0722]), axis=2, keepdims=True)
    pixels = np.clip((luminance + saturation * (pixels - luminance)) * brightness, 0, 1)
    image = Image.fromarray(np.rint(pixels * 255).astype(np.uint8))
    encoded = io.BytesIO()
    image.save(encoded, "JPEG", quality=89, optimize=True)
    final = encoded.getvalue()
    filename = re.sub(r"[^a-z0-9]+", "", obj["id"].lower()) + ".jpg"
    temp = OUT / (filename + ".tmp")
    temp.write_bytes(final)
    temp.replace(OUT / filename)
    metadata = {
        "path": "assets/previews/" + filename,
        **source,
        "credit": "DSS2 / STScI · POSS-II / UKST · NASA SkyView",
        "license": "DSS: некоммерческое использование",
        "licenseUrl": "https://archive.stsci.edu/dss/faq.html",
        "copyrightUrl": "https://archive.stsci.edu/dss/copyright.html",
        "acknowledgmentUrl": "https://archive.stsci.edu/dss/acknowledging.html",
        "kind": "survey", "preview": True,
        "fov": fov, "fovHeight": round(fov * HEIGHT / WIDTH, 6),
        "sourceFov": fov, "sourceFovHeight": round(fov * HEIGHT / WIDTH, 6),
        "majorArcmin": major, "targetFraction": round(fraction, 6),
        "catalogFractionOfWidth": round(major / (60 * fov), 6) if major else None,
        "width": WIDTH, "height": HEIGHT,
        "orientation": "North up; east left; equatorial J2000; TAN projection",
        "displayTransform": {
            "method": "Photographic sky subtraction, gentle stretch and luminance-preserving desaturation",
            "backgroundPercentile": 20, "whitePercentile": 99.7,
            "blackPoint": [round(float(x), 4) for x in black],
            "whitePoint": [round(float(x), 4) for x in white],
            "asinhFactor": asinh_factor,
            "saturation": saturation, "brightness": brightness,
            "luminanceWeights": [0.2126, 0.7152, 0.0722],
            "originalCachedSha256": hashlib.sha256(raw).hexdigest(),
            "originalCachedSizeBytes": len(raw),
            "formula": "u=clip((pixel-P20)/(P99.7-P20),0,1); v=asinh(a*u)/asinh(a); Y=dot(v,[0.2126,0.7152,0.0722]); display=255*brightness*(Y+saturation*(v-Y))",
        },
        "changes": (
            "Coordinate-centered adaptive overview of real DSS2 photographic plates; "
            "SkyView IR/Red/Blue composite or monochrome Red as specified in bands; "
            f"P20 sky subtraction, P99.7 white normalization, asinh factor {asinh_factor}, "
            f"luminance-preserving color fraction {saturation}, brightness {brightness}, JPEG compression. "
            "No generated details or spatial distortion. Display colors are not calibrated true colors or an eyepiece simulation."
        ),
        "copyright": "DSS photographic plates: Caltech/POSS-II, UK SERC/PPARC/AAO and AURA/STScI as applicable. Noncommercial use; commercial applications require a separate license.",
        "sizeBytes": len(final), "sha256": hashlib.sha256(final).hexdigest(),
    }
    return obj["id"], metadata


def persist(manifest):
    temp = MANIFEST.with_suffix(".json.tmp")
    temp.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp.replace(MANIFEST)


def contact_sheet(manifest):
    available = [key for key in PRIORITY if key in manifest]
    if not available:
        return
    sheet = Image.new("RGB", (960, math.ceil(len(available) / 3) * 208), "#10131c")
    draw = ImageDraw.Draw(sheet)
    for index, key in enumerate(available):
        meta = manifest[key]
        tile = Image.open(ROOT / "dist" / meta["path"])
        tile.thumbnail((320, 180), Image.Resampling.LANCZOS)
        x, y = index % 3 * 320, index // 3 * 208
        sheet.paste(tile, (x, y))
        draw.text((x + 10, y + 187), f"{key} | field {meta['fov']:.3f} deg", fill="white")
    sheet.save(CONTACT, "JPEG", quality=93)
    print(f"Contact sheet: {CONTACT}", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sample", action="store_true", help="Only the six priority style examples")
    parser.add_argument("--ids", nargs="*")
    parser.add_argument("--reprocess", action="store_true", help="Rebuild from original cache, never from a stretched preview")
    parser.add_argument("--saturation", type=float, default=0.22)
    parser.add_argument("--brightness", type=float, default=0.9)
    parser.add_argument("--asinh-factor", type=float, default=1.2)
    parser.add_argument("--workers", type=int, default=3)
    args = parser.parse_args()
    if not (0 <= args.saturation <= 1 and 0 < args.brightness <= 1 and 0 < args.asinh_factor <= 10):
        parser.error("Invalid display transform parameters")
    OUT.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    catalog = json.loads((ROOT / "dist/data/catalog.json").read_text())
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    selection = set(PRIORITY) if args.sample else set(args.ids or [])
    pending = []
    for obj in catalog:
        if selection and obj["id"] not in selection:
            continue
        previous = manifest.get(obj["id"])
        if previous and not args.reprocess:
            try:
                validated((ROOT / "dist" / previous["path"]).read_bytes())
                style = previous["displayTransform"]
                if (style["saturation"], style["brightness"], style["asinhFactor"]) == (args.saturation, args.brightness, args.asinh_factor) and previous["fov"] == geometry(obj)[0]:
                    continue
            except Exception:
                pass
        pending.append(obj)
    pending.sort(key=lambda obj: PRIORITY.index(obj["id"]) if obj["id"] in PRIORITY else len(PRIORITY))
    persist(manifest)
    print(f"Catalog {len(catalog)}; cached previews {len(manifest)}; pending {len(pending)}", flush=True)
    failures = []
    started = time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(3, max(1, args.workers))) as pool:
        futures = {pool.submit(preview, obj, args.saturation, args.brightness, args.asinh_factor): obj["id"] for obj in pending}
        for number, future in enumerate(concurrent.futures.as_completed(futures), 1):
            key = futures[future]
            try:
                key, metadata = future.result()
                manifest[key] = metadata
                persist(manifest)
                print(f"[{number}/{len(pending)}] {key}: {metadata['sizeBytes']} bytes; field {metadata['fov']} deg; {metadata['bands']}", flush=True)
            except Exception as exc:
                failures.append(key)
                print(f"FAILED {exc}", flush=True)
    contact_sheet(manifest)
    print(json.dumps({"previews": len(manifest), "failures": failures, "elapsedSeconds": round(time.monotonic()-started, 1)}, ensure_ascii=False), flush=True)
    return bool(failures)


if __name__ == "__main__":
    raise SystemExit(main())
