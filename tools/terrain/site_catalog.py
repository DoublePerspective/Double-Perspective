#!/usr/bin/env python3
"""Turns a terrain release's terrain-catalog.json into the app catalog served at /gps/terrain.json.

Usage: python3 tools/terrain/site_catalog.py <terrain-tag> <terrain-catalog.json> [<trails-tag> <trails-catalog.json> [<surface-tag> <surface-catalog.json> [<contours-tag> <contours-catalog.json> [<routing-tag> <routing-catalog.json>]]]] > gps/terrain.json
Use - - for a part that has no release yet. A terrain pack entry may carry its own "tag" (packs merged from several releases).
The pack files stay on the GitHub release; the app downloads them from there (https, Range resume).
"""
import json, sys

REPO = "DoublePerspective/Double-Perspective"
NAMES = {
    "bc": {
        "province": "BC",
        "pruid": "59",
        "name": "British Columbia",
        "nameFr": "Colombie-Britannique"
    },
    "ab": {
        "province": "AB",
        "pruid": "48",
        "name": "Alberta",
        "nameFr": "Alberta"
    },
    "sk": {
        "province": "SK",
        "pruid": "47",
        "name": "Saskatchewan",
        "nameFr": "Saskatchewan"
    },
    "mb": {
        "province": "MB",
        "pruid": "46",
        "name": "Manitoba",
        "nameFr": "Manitoba"
    },
    "on": {
        "province": "ON",
        "pruid": "35",
        "name": "Ontario",
        "nameFr": "Ontario"
    },
    "qc": {
        "province": "QC",
        "pruid": "24",
        "name": "Quebec",
        "nameFr": "Québec"
    },
    "nb": {
        "province": "NB",
        "pruid": "13",
        "name": "New Brunswick",
        "nameFr": "Nouveau-Brunswick"
    },
    "ns": {
        "province": "NS",
        "pruid": "12",
        "name": "Nova Scotia",
        "nameFr": "Nouvelle-Écosse"
    },
    "pe": {
        "province": "PE",
        "pruid": "11",
        "name": "Prince Edward Island",
        "nameFr": "Île-du-Prince-Édouard"
    },
    "nl": {
        "province": "NL",
        "pruid": "10",
        "name": "Newfoundland and Labrador",
        "nameFr": "Terre-Neuve-et-Labrador"
    },
    "yt": {
        "province": "YT",
        "pruid": "60",
        "name": "Yukon",
        "nameFr": "Yukon"
    },
    "nt": {
        "province": "NT",
        "pruid": "61",
        "name": "Northwest Territories",
        "nameFr": "Territoires du Nord-Ouest"
    },
    "nu": {
        "province": "NU",
        "pruid": "62",
        "name": "Nunavut",
        "nameFr": "Nunavut"
    }
}

tag, path = sys.argv[1], sys.argv[2]
release = json.load(open(path)) if path != "-" else {"packs": []}
packs = []
for info in release["packs"]:
    meta = NAMES[info["id"]]
    packs.append({"id": info["id"], **meta, "file": info["file"], "bytes": info["bytes"], "sha256": info["sha256"],
                  "url": f"https://github.com/{REPO}/releases/download/{info.get('tag', tag)}/{info['file']}"})
packs.sort(key=lambda p: p["name"])
if len(sys.argv) >= 7 and sys.argv[5] != "-":
    surface_tag, surface = sys.argv[5], json.load(open(sys.argv[6]))
    for info in surface["packs"]:
        meta = NAMES[info["id"]]
        packs.append({"id": info["id"], "kind": "surface", **meta, "file": info["file"], "bytes": info["bytes"],
                      "sha256": info["sha256"],
                      "url": f"https://github.com/{REPO}/releases/download/{surface_tag}/{info['file']}"})
if len(sys.argv) >= 11 and sys.argv[9] != "-":
    routing_tag, routing = sys.argv[9], json.load(open(sys.argv[10]))
    for info in routing["packs"]:
        meta = NAMES[info["id"]]
        for kind in ("surface", "route", "search", "address"):
            part = info.get(kind)
            if part is None:
                continue
            packs.append({"id": info["id"], "kind": kind, **meta, "file": part["file"], "bytes": part["bytes"],
                          "sha256": part["sha256"],
                          "url": f"https://github.com/{REPO}/releases/download/{routing_tag}/{part['file']}"})
if len(sys.argv) >= 9 and sys.argv[7] != "-":
    contours_tag, contours = sys.argv[7], json.load(open(sys.argv[8]))
    for info in contours["packs"]:
        meta = NAMES[info["id"]]
        packs.append({"id": info["id"], "kind": "contours", **meta, "file": info["file"], "bytes": info["bytes"],
                      "sha256": info["sha256"],
                      "url": f"https://github.com/{REPO}/releases/download/{info.get('tag', contours_tag)}/{info['file']}"})
if len(sys.argv) >= 5 and sys.argv[3] != "-":
    trails_tag, trails = sys.argv[3], json.load(open(sys.argv[4]))
    packs.insert(0, {"id": "canada", "kind": "trails", "province": "CA", "pruid": "",
                     "name": "Trails: snowmobile, quad, winter roads", "nameFr": "Sentiers : motoneige, quad, chemins d’hiver",
                     "file": trails["file"], "bytes": trails["bytes"], "sha256": trails["sha256"],
                     "url": f"https://github.com/{REPO}/releases/download/{trails_tag}/{trails['file']}"})
json.dump({"schemaVersion": 1, "kind": "terrain", "release": tag, "built": release.get("built"),
           "attribution": "Elevation \u00a9 Natural Resources Canada, Open Government Licence \u2013 Canada",
           "packs": packs}, sys.stdout, indent=2, ensure_ascii=False)
print()
