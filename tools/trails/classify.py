#!/usr/bin/env python3
"""Reads `osmium export -f geojsonseq` lines on stdin, keeps trail-relevant ways, writes slim GeoJSONSeq.

kind: snowmobile | atv | winter_road | seasonal
OpenStreetMap data © OpenStreetMap contributors, ODbL 1.0 (attribution shown in the app).
"""
import json, sys

YES = {"yes", "designated", "permissive"}


def kind_of(t):
    if t.get("ice_road") == "yes" or t.get("winter_road") == "yes":
        return "winter_road"
    if t.get("snowmobile") in YES or t.get("piste:type") == "snowmobile" or t.get("route") == "snowmobile":
        return "snowmobile"
    if t.get("atv") in YES or t.get("ohv") in YES or t.get("route") == "atv":
        return "atv"
    if t.get("seasonal") not in (None, "no") and "highway" in t:
        return "seasonal"
    return None


out = sys.stdout
for line in sys.stdin:
    line = line.strip().lstrip("\x1e")
    if not line:
        continue
    f = json.loads(line)
    geometry = f.get("geometry") or {}
    if geometry.get("type") not in ("LineString", "MultiLineString"):
        continue
    t = f.get("properties") or {}
    kind = kind_of(t)
    if not kind:
        continue
    props = {"kind": kind}
    for key in ("name", "ref", "surface", "seasonal", "highway", "access"):
        if t.get(key):
            props[key] = t[key][:60]
    out.write(json.dumps({"type": "Feature", "geometry": geometry, "properties": props}, separators=(",", ":")) + "\n")
