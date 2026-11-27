#!/usr/bin/env python3
"""Builds an offline routing pack (GPSR1 binary graph) for one province/territory.

Source: National Road Network (NRCan / Statistics Canada), Open Government Licence – Canada.
usage: build_routing.py NRN_GPKG OUTPUT.gpsr

File layout (little-endian):
  magic "GPSR1\\0\\0\\0", int32 nodeCount, int32 edgeCount, int32 shapeCount, int32 nameBytes
  nodes:  int32 lat[n], int32 lon[n]                (micro-degrees)
  offsets: int32[n+1]                               (CSR: outgoing edges of node i are offsets[i]..offsets[i+1])
  edges:  int32 to, int32 lengthDm, int32 nameOffset (-1 none), int32 shapeStart, uint16 shapeLen,
          uint8 flags (bits 0-1 surface 0 paved/1 unpaved/2 unknown, bits 2-4 class, bit 5 shape reversed),
          uint8 speedKph (0 unknown)                 = 20 bytes each
  shapes: int32 lat, int32 lon per point (micro-degrees, both ends included)
  names:  UTF-8, each name terminated by \\0
"""
import math, struct, sys
import numpy as np
import pyogrio
from shapely import get_coordinates, simplify

CLASSES = {"Freeway": 0, "Expressway / Highway": 1, "Arterial": 2, "Collector": 3, "Local / Street": 4,
           "Local / Strata": 4, "Local / Unknown": 4, "Resource / Recreation": 5, "Service Lane": 6,
           "Alleyway / Lane": 6, "Ramp": 7}
SKIP = {"Rapid Transit", "Winter"}  # ice/winter roads are shown on the trails layer, never routed


def main(gpkg, output):
    layer = next(name for name, _ in pyogrio.list_layers(gpkg) if name.upper().endswith("ROADSEG"))
    columns = ["PAVSTATUS", "ROADCLASS", "TRAFFICDIR", "SPEED", "L_STNAME_C", "R_STNAME_C", "RTNUMBER1"]
    frame = pyogrio.read_dataframe(gpkg, layer=layer, columns=columns).to_crs(4326)
    build(frame, None, output)


def build(frame, surfaces, output):
    """frame: NRN ROADSEG (EPSG:4326). surfaces: corrected "paved"/"unpaved"/"unknown" per row, or None for NRN's own."""
    if surfaces is None:
        surfaces = ["paved" if v == "Paved" else "unpaved" if v == "Unpaved" else "unknown" for v in frame["PAVSTATUS"]]
    keep = ~frame["ROADCLASS"].isin(SKIP).to_numpy()
    frame = frame[keep]
    surfaces = [s for s, k in zip(surfaces, keep) if k]
    print("segments:", len(frame), flush=True)

    node_ids, node_lat, node_lon = {}, [], []

    def node(lat, lon):
        key = (round(lat * 1e5), round(lon * 1e5))  # ~1 m: joins segment ends that meet
        found = node_ids.get(key)
        if found is None:
            found = len(node_lat)
            node_ids[key] = found
            node_lat.append(int(round(lat * 1e6)))
            node_lon.append(int(round(lon * 1e6)))
        return found

    names, name_offsets, name_bytes = bytearray(), {}, 0

    def name_offset(text):
        nonlocal name_bytes
        if not text:
            return -1
        found = name_offsets.get(text)
        if found is None:
            found = len(names)
            name_offsets[text] = found
            names.extend(text.encode("utf-8") + b"\0")
        return found

    shapes = []  # flat list of (lat, lon) int pairs
    directed = []  # (from, to, length_dm, name, shape_start, shape_len, flags, speed)
    for geometry, pav, cls, direction, speed, lname, rname, route in zip(
            frame.geometry, surfaces, frame["ROADCLASS"], frame["TRAFFICDIR"], frame["SPEED"],
            frame["L_STNAME_C"], frame["R_STNAME_C"], frame["RTNUMBER1"]):
        if geometry is None or geometry.is_empty:
            continue
        coords = get_coordinates(simplify(geometry, 0.00002))  # ~2 m, keeps curves
        if len(coords) < 2:
            continue
        lons, lats = coords[:, 0], coords[:, 1]
        length = 0.0
        for i in range(1, len(coords)):
            length += haversine(lats[i - 1], lons[i - 1], lats[i], lons[i])
        if length < 0.5:
            continue
        a = node(lats[0], lons[0])
        b = node(lats[-1], lons[-1])
        if a == b and length < 5:
            continue
        surface = 0 if pav == "paved" else 1 if pav == "unpaved" else 2
        road_class = CLASSES.get(cls, 4)
        label = (lname or rname or "").strip()
        if not label and route and str(route) not in ("None", "-1"):
            label = f"Route {route}"
        name = name_offset(label)
        start = len(shapes)
        shapes.extend(zip((np.round(lats * 1e6)).astype(np.int64).tolist(), (np.round(lons * 1e6)).astype(np.int64).tolist()))
        count = len(coords)
        kph = int(speed) if speed is not None and not (isinstance(speed, float) and math.isnan(speed)) and 0 < int(speed) < 200 else 0
        flags = surface | (road_class << 2)
        length_dm = int(round(length * 10))
        if direction != "Opposite direction":
            directed.append((a, b, length_dm, name, start, count, flags, kph))
        if direction != "Same direction":
            directed.append((b, a, length_dm, name, start, count, flags | 0x20, kph))

    n = len(node_lat)
    directed.sort(key=lambda e: e[0])
    offsets = np.zeros(n + 1, dtype=np.int32)
    for e in directed:
        offsets[e[0] + 1] += 1
    offsets = np.cumsum(offsets).astype(np.int32)

    with open(output, "wb") as out:
        out.write(b"GPSR1\0\0\0")
        out.write(struct.pack("<4i", n, len(directed), len(shapes), len(names)))
        out.write(np.asarray(node_lat, dtype="<i4").tobytes())
        out.write(np.asarray(node_lon, dtype="<i4").tobytes())
        out.write(offsets.astype("<i4").tobytes())
        record = struct.Struct("<4iHBB")
        buffer = bytearray()
        for (_, to, length_dm, name, start, count, flags, kph) in directed:
            buffer += record.pack(to, length_dm, name, start, min(count, 65535), flags, kph)
        out.write(buffer)
        out.write(np.asarray(shapes, dtype="<i4").tobytes())
        out.write(bytes(names))
    print(f"nodes {n}, edges {len(directed)}, shape points {len(shapes)}, names {len(name_offsets)}", flush=True)


def haversine(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371000.0 * 2 * math.asin(math.sqrt(min(1.0, h)))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
