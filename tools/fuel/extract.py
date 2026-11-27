#!/usr/bin/env python3
"""Gas stations (amenity=fuel) from an OpenStreetMap extract → fuel-canada.tsv.gz for Gravel & Pavement Scout.

Columns: lat, lon (5 decimals), name (or brand), brand, opening_hours, flags (d = diesel, 24 = open 24/7).
Stations drawn as areas are reduced to the centre of their outline. © OpenStreetMap contributors, ODbL 1.0.
"""
import gzip
import sys

import osmium


class Stations(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.rows = {}

    def add(self, key, lat, lon, tags):
        if tags.get("amenity") != "fuel" or tags.get("disused") or tags.get("abandoned"):
            return
        name = (tags.get("name") or tags.get("brand") or tags.get("operator") or "").replace("\t", " ").strip()
        brand = (tags.get("brand") or "").replace("\t", " ").strip()
        hours = (tags.get("opening_hours") or "").replace("\t", " ").strip()
        flags = []
        if tags.get("fuel:diesel") == "yes":
            flags.append("d")
        if hours == "24/7":
            flags.append("24")
        self.rows[key] = (round(lat, 5), round(lon, 5), name, brand, hours, ",".join(flags))

    def node(self, n):
        if n.location.valid():
            self.add(("n", n.id), n.location.lat, n.location.lon, dict(n.tags))

    def way(self, w):
        points = [(nd.lat, nd.lon) for nd in w.nodes if nd.location.valid()]
        if points:
            lat = sum(p[0] for p in points) / len(points)
            lon = sum(p[1] for p in points) / len(points)
            self.add(("w", w.id), lat, lon, dict(w.tags))


def main(source, target):
    handler = Stations()
    handler.apply_file(source, locations=True)
    rows = sorted(handler.rows.values())
    with gzip.open(target, "wt", encoding="utf-8") as out:
        for row in rows:
            out.write("\t".join(str(v) for v in row) + "\n")
    print(f"{len(rows)} stations → {target}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
