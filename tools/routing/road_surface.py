#!/usr/bin/env python3
"""Road surface for Gravel & Pavement Scout: National Road Network (NRN) corrected with OpenStreetMap.

Rule (agreed 2026-11-27): a segment is PAVED if either source says paved; where NRN does not know,
OSM's surface fills in. NRN "unpaved" is often years out of date on streets paved since.
OSM data © OpenStreetMap contributors (ODbL); NRN © NRCan (OGL-Canada). Packs built with this are
published openly under the ODbL as required for a derived database.

    corrected_surface(frame, osm_geojsons) -> list of "paved" / "unpaved" / "unknown"
frame: NRN ROADSEG GeoDataFrame in EPSG:4326 with a PAVSTATUS column.
osm_geojsons: output of `osmium export -f geojsonseq` of highway ways that carry a surface tag.
"""
import json
import numpy as np
from shapely import STRtree, line_interpolate_point, get_coordinates
from shapely.geometry import shape

PAVED = {"paved", "asphalt", "concrete", "concrete:plates", "concrete:lanes", "paving_stones", "sett", "chipseal",
         "bricks", "metal", "unhewn_cobblestone", "cobblestone"}
UNPAVED = {"unpaved", "gravel", "fine_gravel", "compacted", "dirt", "earth", "ground", "grass", "sand", "mud",
           "pebblestone", "rock", "woodchips"}
NEAR = 0.00011  # degrees ≈ 12 m north–south, ≈ 8 m east–west at Canadian latitudes


def load_osm(path):
    paved, unpaved = [], []
    with open(path, encoding="utf-8") as source:
        for line in source:
            line = line.strip().lstrip("\x1e")
            if not line:
                continue
            feature = json.loads(line)
            surface = (feature.get("properties") or {}).get("surface", "")
            geometry = feature.get("geometry")
            if not geometry or geometry.get("type") not in ("LineString", "MultiLineString"):
                continue
            kind = surface.split(";")[0].strip()
            if kind in PAVED:
                paved.append(shape(geometry))
            elif kind in UNPAVED:
                unpaved.append(shape(geometry))
    return paved, unpaved


def _matches(tree, geometries, samples):
    """For each segment (3 sample points each), True when at least 2 of its points lie near one OSM way."""
    if not geometries:
        return np.zeros(len(samples) // 3, dtype=bool)
    points_idx, lines_idx = tree.query(samples, predicate="dwithin", distance=NEAR)
    hits = {}
    for p, l in zip(points_idx.tolist(), lines_idx.tolist()):
        hits.setdefault((p // 3, l), set()).add(p % 3)
    result = np.zeros(len(samples) // 3, dtype=bool)
    for (segment, _), seen in hits.items():
        if len(seen) >= 2:
            result[segment] = True
    return result


def corrected_surface(frame, osm_geojsons):
    nrn = ["paved" if v == "Paved" else "unpaved" if v == "Unpaved" else "unknown" for v in frame["PAVSTATUS"]]
    paved_lines, unpaved_lines = load_osm(osm_geojsons)
    geometries = list(frame.geometry)
    samples = []
    for g in geometries:
        if g is None or g.is_empty:
            samples += [None, None, None]
        else:
            samples += [line_interpolate_point(g, f, normalized=True) for f in (0.25, 0.5, 0.75)]
    valid = np.array([s is not None for s in samples])
    sample_array = np.array([s if s is not None else line_interpolate_point(geometries[0], 0.5, normalized=True) for s in samples], dtype=object)
    osm_paved = _matches(STRtree(paved_lines), paved_lines, sample_array) if paved_lines else np.zeros(len(geometries), bool)
    osm_unpaved = _matches(STRtree(unpaved_lines), unpaved_lines, sample_array) if unpaved_lines else np.zeros(len(geometries), bool)
    valid_segment = valid.reshape(-1, 3).all(axis=1)
    out, upgraded, filled = [], 0, 0
    for i, value in enumerate(nrn):
        if valid_segment[i] and osm_paved[i] and value != "paved":
            upgraded += value == "unpaved"
            filled += value == "unknown"
            value = "paved"
        elif valid_segment[i] and value == "unknown" and osm_unpaved[i]:
            value = "unpaved"
            filled += 1
        out.append(value)
    print(f"surface: {len(out)} segments, {upgraded} unpaved->paved from OSM, {filled} unknown filled from OSM,"
          f" OSM ways with surface: {len(paved_lines)} paved / {len(unpaved_lines)} unpaved", flush=True)
    return out
