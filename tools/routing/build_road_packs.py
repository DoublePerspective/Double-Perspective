#!/usr/bin/env python3
"""One province, all road packs from the same corrected surface:
surface-<p>.geojsons (for the map tiles), route-<p>.gpsr, search-<p>.tsv.gz, addr-<p>.tsv.gz.

usage: build_road_packs.py PROV NRN_GPKG OSM_SURFACE.geojsons CGN_CSV [OSM_TOLL.geojsons]
Toll roads: OSM toll=yes ways plus NRN toll booths (TOLLPOINT); ferries: NRN FERRYSEG.
"""
import json, os, sys
import pyogrio

sys.path.insert(0, os.path.dirname(__file__))
from road_surface import corrected_surface, osm_line_matches, near_points  # noqa: E402
import build_routing, build_search, build_addresses  # noqa: E402

prov, gpkg, osm, cgn = sys.argv[1:5]
osm_toll = sys.argv[5] if len(sys.argv) > 5 else None
layers = [name for name, _ in pyogrio.list_layers(gpkg)]
layer = next(name for name in layers if name.upper().endswith("ROADSEG"))
columns = ["PAVSTATUS", "ROADCLASS", "TRAFFICDIR", "SPEED", "L_STNAME_C", "R_STNAME_C", "RTNUMBER1"]
frame = pyogrio.read_dataframe(gpkg, layer=layer, columns=columns).to_crs(4326)
surfaces = corrected_surface(frame, osm)


def optional_layer(suffix):
    name = next((n for n in layers if n.upper().endswith(suffix)), None)
    return pyogrio.read_dataframe(gpkg, layer=name).to_crs(4326) if name else None


ferries = optional_layer("FERRYSEG")
toll_points = optional_layer("TOLLPOINT")
tolls = osm_line_matches(frame, osm_toll) if osm_toll else None
if toll_points is not None and len(toll_points):
    booths = near_points(frame, list(toll_points.geometry))
    tolls = booths if tolls is None else (tolls | booths)
print("toll segments:", int(tolls.sum()) if tolls is not None else 0, "· ferry segments:",
      len(ferries) if ferries is not None else 0, flush=True)

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

build_routing.build(frame, surfaces, f"route-{prov}.gpsr", tolls=tolls, ferries=ferries)
build_search.main(gpkg, cgn, f"search-{prov}.tsv.gz")
build_addresses.main(gpkg, f"addr-{prov}.tsv.gz")
