#!/usr/bin/env python3
"""One province, all road packs from the same corrected surface:
surface-<p>.geojsons (for the map tiles), route-<p>.gpsr, search-<p>.tsv.gz, addr-<p>.tsv.gz.

usage: build_road_packs.py PROV NRN_GPKG OSM_SURFACE.geojsons CGN_CSV
"""
import json, os, sys
import pyogrio

sys.path.insert(0, os.path.dirname(__file__))
from road_surface import corrected_surface  # noqa: E402
import build_routing, build_search, build_addresses  # noqa: E402

prov, gpkg, osm, cgn = sys.argv[1:5]
layer = next(name for name, _ in pyogrio.list_layers(gpkg) if name.upper().endswith("ROADSEG"))
columns = ["PAVSTATUS", "ROADCLASS", "TRAFFICDIR", "SPEED", "L_STNAME_C", "R_STNAME_C", "RTNUMBER1"]
frame = pyogrio.read_dataframe(gpkg, layer=layer, columns=columns).to_crs(4326)
surfaces = corrected_surface(frame, osm)

with open(f"surface-{prov}.geojsons", "w", encoding="utf-8") as out:
    for geometry, s, c, ln, rn in zip(frame.geometry, surfaces, frame["ROADCLASS"], frame["L_STNAME_C"], frame["R_STNAME_C"]):
        if geometry is None or geometry.is_empty or c in ("Rapid Transit",):
            continue
        props = {"s": s, "c": c}
        name = (ln or rn or "").strip()
        if name and name not in ("None", "Unknown"):
            props["name"] = name
        out.write(json.dumps({"type": "Feature", "properties": props, "geometry": geometry.__geo_interface__},
                             separators=(",", ":")) + "\n")

build_routing.build(frame, surfaces, f"route-{prov}.gpsr")
build_search.main(gpkg, cgn, f"search-{prov}.tsv.gz")
build_addresses.main(gpkg, f"addr-{prov}.tsv.gz")
