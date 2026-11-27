#!/usr/bin/env python3
"""Extracts snowmobile / ATV / winter-road / seasonal lines from an OSM extract into GeoJSONSeq.

Ways count if they are tagged themselves or belong to a route=snowmobile|atv relation
(the way then takes the route's kind, ref and name). Usage: extract.py in.osm.pbf out.geojsons
OpenStreetMap data © OpenStreetMap contributors, ODbL 1.0.
"""
import json, sys
import osmium

YES = {"yes", "designated", "permissive"}


def own_kind(t):
    if t.get("ice_road") == "yes" or t.get("winter_road") == "yes":
        return "winter_road"
    if t.get("snowmobile") in YES or t.get("piste:type") == "snowmobile":
        return "snowmobile"
    if t.get("atv") in YES or t.get("ohv") in YES:
        return "atv"
    if t.get("seasonal") not in (None, "no") and "highway" in t:
        return "seasonal"
    return None


class Routes(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.members = {}

    def relation(self, r):
        route = r.tags.get("route")
        if route not in ("snowmobile", "atv"):
            return
        info = {"kind": "snowmobile" if route == "snowmobile" else "atv",
                "ref": r.tags.get("ref"), "name": r.tags.get("name")}
        for m in r.members:
            if m.type == "w":
                self.members.setdefault(m.ref, info)


class Ways(osmium.SimpleHandler):
    def __init__(self, members, out):
        super().__init__()
        self.members, self.out, self.counts = members, out, {}

    def way(self, w):
        t = {tag.k: tag.v for tag in w.tags}
        kind = own_kind(t)
        route = self.members.get(w.id)
        if t.get("snowmobile") == "no" and route and route["kind"] == "snowmobile":
            route = None
        if not kind and route:
            kind = route["kind"]
        if not kind:
            return
        try:
            coords = [(round(n.lon, 6), round(n.lat, 6)) for n in w.nodes]
        except osmium.InvalidLocationError:
            return
        if len(coords) < 2:
            return
        props = {"kind": kind}
        for key in ("ref", "name"):
            value = t.get(key) or (route or {}).get(key)
            if value:
                props[key] = value[:60]
        for key in ("surface", "seasonal", "highway"):
            if t.get(key):
                props[key] = t[key][:40]
        self.counts[kind] = self.counts.get(kind, 0) + 1
        self.out.write(json.dumps({"type": "Feature", "properties": props,
                                   "geometry": {"type": "LineString", "coordinates": coords}}, separators=(",", ":")) + "\n")


source, target = sys.argv[1], sys.argv[2]
routes = Routes()
routes.apply_file(source)
print("route member ways:", len(routes.members))
with open(target, "w") as out:
    ways = Ways(routes.members, out)
    ways.apply_file(source, locations=True, idx="flex_mem")
print(ways.counts)
