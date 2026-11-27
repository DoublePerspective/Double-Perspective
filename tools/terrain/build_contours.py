#!/usr/bin/env python3
"""Builds a PMTiles file of contour lines for one province/territory (Gravel & Pavement Scout, Pro).

Elevation © Natural Resources Canada (MRDEM 30 m, CDEM fallback), Open Government Licence – Canada.
The DEM is resampled (60 m south, 90 m in the territories), contoured every 20 m (40 m in the west and north), tiled to zoom 12:
index lines (every 5th) from zoom 9, all lines from zoom 11. Layer "contours", properties: m (metres), major (1 = every 100 m).

usage: build_contours.py PROVINCE_ID OUTPUT.pmtiles
"""
import json, os, subprocess, sys, hashlib

sys.path.insert(0, os.path.dirname(__file__))
from build_terrain import BOUNDS, SOURCES  # noqa: E402

province, output = sys.argv[1], sys.argv[2]
west, south, east, north = BOUNDS[province]
# Lighter packs for big or mountainous provinces: coarser grid, wider spacing (index lines every 5 intervals).
res = 60 if province in ("pe", "ns", "nb") else 90
interval = 40 if province in ("bc", "yt", "nt", "nu", "ab") else 20
major = interval * 5
env = dict(os.environ, GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
           GDAL_HTTP_MAX_RETRY="5", GDAL_HTTP_RETRY_DELAY="3", GDAL_CACHEMAX="2048")


def run(*args):
    print("+", " ".join(args), flush=True)
    subprocess.run(args, check=True, env=env)


for source in SOURCES:
    try:
        run("gdalwarp", "-q", "-overwrite", "-multi", "-wo", "NUM_THREADS=ALL_CPUS", "-te_srs", "EPSG:4326",
            "-te", str(west), str(south), str(east), str(north), "-tr", str(res), str(res), "-r", "average",
            "-co", "COMPRESS=DEFLATE", "-co", "TILED=YES", "-co", "BIGTIFF=YES", "/vsicurl/" + source, "dem.tif")
        break
    except subprocess.CalledProcessError:
        print("source failed, trying next", flush=True)
else:
    sys.exit("no elevation source could be read")

run("gdal_contour", "-q", "-a", "m", "-i", str(interval), "-f", "GPKG", "dem.tif", "contours.gpkg")
run("ogr2ogr", "-f", "GeoJSONSeq", "-t_srs", "EPSG:4326", "-lco", "RS=NO", "contours.geojsons", "contours.gpkg",
    "-dialect", "sqlite", "-sql",
    f"SELECT CAST(ROUND(m) AS INTEGER) AS m, CASE WHEN CAST(ROUND(m) AS INTEGER) % {major} = 0 THEN 1 ELSE 0 END AS major, "
    "geom FROM contour WHERE ST_Length(geom) > 500")
run("tippecanoe", "-o", output, "-l", "contours", "-Z", "9", "-z", "12", "--force", "--drop-densest-as-needed",
    "--simplification=12", "--no-tile-size-limit",
    "-j", '{"contours": ["any", [">=", "$zoom", 11], ["==", "major", 1]]}',
    "--attribution=Contours: elevation © Natural Resources Canada, OGL-Canada", "contours.geojsons")
print(json.dumps({"id": province, "file": os.path.basename(output), "bytes": os.path.getsize(output),
                  "sha256": hashlib.sha256(open(output, "rb").read()).hexdigest()}))
