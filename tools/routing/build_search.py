#!/usr/bin/env python3
"""Builds the offline search pack for one province: official place names + street names.

Sources (Open Government Licence – Canada): Canadian Geographical Names (NRCan) and the National Road Network.
usage: build_search.py NRN_GPKG CGN_CSV OUTPUT.tsv.gz
Each line: name \t kind \t lat \t lon \t context   (kind: city/town/village/place/lake/park/mountain/street/...)
"""
import csv, gzip, math, sys
from collections import defaultdict
import pyogrio
from shapely import line_interpolate_point

CONCISE = {"CITY": "city", "TOWN": "town", "VILG": "village", "HAM": "place", "UNP": "place", "MUN1": "place",
           "MUN2": "place", "IR": "place", "PARK": "park", "PROV": "park", "LAKE": "lake", "RIV": "river", "MTN": "mountain",
           "MT": "mountain", "HILL": "mountain", "FALL": "falls", "BAY": "bay", "ISL": "island", "CAPE": "cape",
           "CAMP": "camp", "STRM": "river", "RES": "lake", "RAP": "rapids", "MILT": "place", "STAT": "place", "VALL": "valley"}
RANK = {"city": 0, "town": 1, "village": 2, "place": 3, "park": 4, "lake": 5, "mountain": 5, "falls": 5, "river": 6}


def main(gpkg, cgn_csv, output):
    rows = []
    with open(cgn_csv, encoding="utf-8-sig", errors="replace") as source:
        for row in csv.DictReader(source):
            name = (row.get("Geographical Name") or row.get("GEONAME") or "").strip()
            code = (row.get("Concise Code") or row.get("CONCISE") or "").strip()
            kind = CONCISE.get(code)
            if not name or not kind:
                continue
            try:
                lat, lon = float(row.get("Latitude") or row["LATITUDE"]), float(row.get("Longitude") or row["LONGITUDE"])
            except (KeyError, ValueError):
                continue
            rows.append((name, kind, lat, lon, (row.get("Location") or "").strip()))
    places = len(rows)

    layer = next(name for name, _ in pyogrio.list_layers(gpkg) if name.upper().endswith("ROADSEG"))
    frame = pyogrio.read_dataframe(gpkg, layer=layer, columns=["L_STNAME_C", "R_STNAME_C", "L_PLACENAM", "R_PLACENAM"]).to_crs(4326)
    streets = defaultdict(list)  # (name, place) -> midpoints
    for geometry, lname, rname, lplace, rplace in zip(frame.geometry, frame["L_STNAME_C"], frame["R_STNAME_C"],
                                                      frame["L_PLACENAM"], frame["R_PLACENAM"]):
        name = (lname or rname or "").strip()
        if not name or name in ("None", "Unknown") or geometry is None or geometry.is_empty:
            continue
        place = (lplace or rplace or "").strip()
        point = line_interpolate_point(geometry, 0.5, normalized=True)
        streets[(name, place)].append((point.y, point.x))
    for (name, place), points in streets.items():
        # One entry per street and municipality, at the middle segment (stays on the road).
        points.sort()
        lat, lon = points[len(points) // 2]
        rows.append((name, "street", lat, lon, place))

    rows.sort(key=lambda r: (RANK.get(r[1], 9), r[0].lower()))
    with gzip.open(output, "wt", encoding="utf-8") as out:
        for name, kind, lat, lon, context in rows:
            out.write(f"{name}\t{kind}\t{lat:.6f}\t{lon:.6f}\t{context.replace(chr(9), ' ')}\n")
    print(f"places {places}, streets {len(streets)}", flush=True)


if __name__ == "__main__":
    main(*sys.argv[1:4])
