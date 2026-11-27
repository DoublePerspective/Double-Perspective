#!/usr/bin/env python3
"""Builds the offline house-number index for one province from National Road Network address ranges.

Source: National Road Network (NRCan / Statistics Canada), Open Government Licence – Canada.
usage: build_addresses.py NRN_GPKG OUTPUT.tsv.gz
Each line (sorted by key): key \t street \t place \t leftFrom \t leftTo \t rightFrom \t rightTo \t lat,lon;lat,lon;...
key = street name lowercased without accents or punctuation. 0 = no number on that side.
The app interpolates a house number along the segment, on the side whose range holds it.
"""
import gzip, re, sys, unicodedata
import pyogrio
from shapely import get_coordinates, simplify


def key(text):
    text = unicodedata.normalize("NFD", text.lower())
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def number(value):
    try:
        n = int(float(value))
        return n if n > 0 else 0
    except (TypeError, ValueError):
        return 0


def main(gpkg, output):
    layer = next(name for name, _ in pyogrio.list_layers(gpkg) if name.upper().endswith("ROADSEG"))
    fields = set(pyogrio.read_info(gpkg, layer=layer)["fields"])
    wanted = ["L_HNUMF", "L_HNUML", "R_HNUMF", "R_HNUML", "L_STNAME_C", "R_STNAME_C", "L_PLACENAM", "R_PLACENAM"]
    missing = [f for f in wanted if f not in fields]
    if missing:
        sys.exit(f"missing NRN fields {missing}; have {sorted(fields)}")
    frame = pyogrio.read_dataframe(gpkg, layer=layer, columns=wanted).to_crs(4326)
    rows = []
    for g, lf, lt, rf, rt, ln, rn, lp, rp in zip(frame.geometry, frame["L_HNUMF"], frame["L_HNUML"], frame["R_HNUMF"],
                                                 frame["R_HNUML"], frame["L_STNAME_C"], frame["R_STNAME_C"],
                                                 frame["L_PLACENAM"], frame["R_PLACENAM"]):
        lf, lt, rf, rt = number(lf), number(lt), number(rf), number(rt)
        if not (lf or lt or rf or rt) or g is None or g.is_empty:
            continue
        name = (ln or rn or "").strip()
        if not name or name in ("None", "Unknown"):
            continue
        place = (lp or rp or "").strip()
        coords = get_coordinates(simplify(g, 0.00003))
        if len(coords) < 2:
            continue
        line = ";".join(f"{lat:.5f},{lon:.5f}" for lon, lat in coords)
        rows.append((key(name), name, place, lf, lt, rf, rt, line))
    rows.sort()
    with gzip.open(output, "wt", encoding="utf-8", compresslevel=9) as out:
        for r in rows:
            out.write("\t".join(str(v) for v in r) + "\n")
    print(f"address segments {len(rows)}", flush=True)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
