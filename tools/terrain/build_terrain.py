#!/usr/bin/env python3
"""Build one offline terrain-shading pack (PMTiles of WebP hillshade tiles) for a Canadian province/territory.

Source: Natural Resources Canada elevation (MRDEM 30 m, falling back to CDEM), Open Government Licence – Canada.
Output tiles are transparent overlays: dark where slopes face away from the light (north-west sun), light where
they face it, nothing on flat ground, so they sit under the road layers of any map style.

usage: build_terrain.py PROVINCE_ID OUTPUT.pmtiles [--max-zoom 11]
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import sys
import time

import mercantile
import numpy as np
from PIL import Image
import rasterio
from rasterio.enums import Resampling
from rasterio.vrt import WarpedVRT
from rasterio.windows import Window, from_bounds
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import Writer

SOURCES = [
    "https://datacube-prod-data-public.s3.ca-central-1.amazonaws.com/store/elevation/mrdem/mrdem-30/mrdem-30-dtm.tif",
    "https://datacube-prod-data-public.s3.ca-central-1.amazonaws.com/store/elevation/cdem-cdsm/cdem/cdem-canada-dem.tif",
]

# Rough bounds (west, south, east, north). Neighbours overlap a little; that's fine.
BOUNDS = {
    "bc": (-139.1, 48.2, -114.0, 60.0),
    "ab": (-120.0, 49.0, -110.0, 60.0),
    "sk": (-110.0, 49.0, -101.3, 60.0),
    "mb": (-102.1, 49.0, -88.9, 60.0),
    "on": (-95.2, 41.6, -74.3, 56.9),
    "qc": (-79.8, 44.9, -57.1, 62.6),
    "nb": (-69.1, 44.5, -63.7, 48.1),
    "ns": (-66.4, 43.3, -59.6, 47.1),
    "pe": (-64.5, 45.9, -61.9, 47.1),
    "nl": (-67.9, 46.6, -52.6, 60.4),
    "yt": (-141.0, 60.0, -123.8, 69.7),
    "nt": (-136.5, 60.0, -101.9, 78.8),
    "nu": (-121.0, 51.6, -61.0, 83.2),
}

MIN_ZOOM = 5
BLOCK_ZOOM = 8          # DEM is read one z8 tile at a time; children are rendered from it
TILE = 256
SUN_AZIMUTH = 315.0
SUN_ALTITUDE = 45.0
WEBP_QUALITY = 62


def open_source():
    env = rasterio.Env(GDAL_HTTP_MULTIRANGE="YES", GDAL_HTTP_MERGE_CONSECUTIVE_RANGES="YES",
                       GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_CACHEMAX=1024,
                       CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif", GDAL_HTTP_MAX_RETRY=5, GDAL_HTTP_RETRY_DELAY=3)
    env.__enter__()
    for url in SOURCES:
        try:
            src = rasterio.open(url)
            print("source:", url, src.crs, src.res, flush=True)
            return src, url
        except Exception as error:  # noqa: BLE001
            print("source unavailable:", url, error, flush=True)
    sys.exit("no elevation source reachable")


def hillshade(dem: np.ndarray, metres_per_px: float, exaggeration: float) -> np.ndarray:
    """dem has a 1 px border. Returns shade in 0..1 for the inner area (1 = facing the sun)."""
    z = dem * exaggeration
    dzdx = ((z[1:-1, 2:] - z[1:-1, :-2]) / (2 * metres_per_px))
    dzdy = ((z[2:, 1:-1] - z[:-2, 1:-1]) / (2 * metres_per_px))
    slope = np.arctan(np.hypot(dzdx, dzdy))
    aspect = np.arctan2(dzdy, -dzdx)
    zenith = math.radians(90 - SUN_ALTITUDE)
    azimuth = math.radians(360 - SUN_AZIMUTH + 90)
    shade = math.cos(zenith) * np.cos(slope) + math.sin(zenith) * np.sin(slope) * np.cos(azimuth - aspect)
    return np.clip(shade, 0, 1)


def overlay(shade: np.ndarray, valid: np.ndarray) -> Image.Image | None:
    flat = math.cos(math.radians(90 - SUN_ALTITUDE))
    delta = shade - flat
    dark = np.clip(-delta * 1.9, 0, 0.62)
    light = np.clip(delta * 1.3, 0, 0.30)
    alpha = np.where(delta < 0, dark, light) * valid
    if alpha.max() < 0.04:
        return None  # flat or no data: leave the tile out, the map shows through
    rgba = np.zeros(shade.shape + (4,), dtype=np.uint8)
    is_dark = delta < 0
    rgba[..., 0] = np.where(is_dark, 14, 255)
    rgba[..., 1] = np.where(is_dark, 22, 255)
    rgba[..., 2] = np.where(is_dark, 34, 250)
    rgba[..., 3] = np.rint(alpha * 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def encode(image: Image.Image) -> bytes:
    out = io.BytesIO()
    image.save(out, format="WEBP", quality=WEBP_QUALITY, method=4, alpha_quality=70)
    return out.getvalue()


def exaggeration_for(zoom: int) -> float:
    # Low zooms flatten relief; boost it so mountains still read on the overview.
    return {5: 4.0, 6: 3.2, 7: 2.6, 8: 2.0, 9: 1.6, 10: 1.3}.get(zoom, 1.1)


def read_block(vrt, tile: mercantile.Tile, px: int) -> tuple[np.ndarray, np.ndarray]:
    """Read DEM for a tile at px×px resolution, plus a 1 px border, in EPSG:3857."""
    b = mercantile.xy_bounds(tile)
    step = (b.right - b.left) / px
    full = px + 2
    dem = np.zeros((full, full), dtype="float32")
    valid = np.zeros((full, full), dtype=bool)
    window = from_bounds(b.left - step, b.bottom - step, b.right + step, b.top + step, transform=vrt.transform)
    inside = window.intersection(Window(0, 0, vrt.width, vrt.height)) if _overlaps(window, vrt) else None
    if inside is None or inside.width <= 0 or inside.height <= 0:
        return dem, valid
    scale_x = full / window.width
    scale_y = full / window.height
    col0 = int(round((inside.col_off - window.col_off) * scale_x))
    row0 = int(round((inside.row_off - window.row_off) * scale_y))
    cols = max(1, min(full - col0, int(round(inside.width * scale_x))))
    rows = max(1, min(full - row0, int(round(inside.height * scale_y))))
    data = vrt.read(1, window=inside, out_shape=(rows, cols), resampling=Resampling.bilinear, masked=True)
    part_valid = ~np.ma.getmaskarray(data)
    part = np.ma.filled(data.astype("float32"), 0.0)
    part_valid &= part > -500
    part[~part_valid] = 0.0
    dem[row0:row0 + rows, col0:col0 + cols] = part
    valid[row0:row0 + rows, col0:col0 + cols] = part_valid
    return dem, valid


def _overlaps(window, vrt) -> bool:
    return (window.col_off < vrt.width and window.row_off < vrt.height
            and window.col_off + window.width > 0 and window.row_off + window.height > 0)


def render(dem: np.ndarray, valid: np.ndarray, tile: mercantile.Tile, size: int) -> dict[mercantile.Tile, bytes]:
    """Render a block (size px + border) into the 256 px tiles it covers at tile.z + log2(size/256)."""
    zoom = tile.z + int(round(math.log2(size / TILE)))
    lat = mercantile.ul(tile.x, tile.y + 0.5, tile.z).lat
    b = mercantile.xy_bounds(tile)
    metres_per_px = (b.right - b.left) / size * math.cos(math.radians(lat))
    shade = hillshade(dem, metres_per_px, exaggeration_for(zoom))
    inner_valid = valid[1:-1, 1:-1].astype("float32")
    tiles = {}
    n = size // TILE
    for dy in range(n):
        for dx in range(n):
            sl = (slice(dy * TILE, (dy + 1) * TILE), slice(dx * TILE, (dx + 1) * TILE))
            image = overlay(shade[sl], inner_valid[sl])
            if image is not None:
                tiles[mercantile.Tile(tile.x * n + dx, tile.y * n + dy, zoom)] = encode(image)
    return tiles


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("province", choices=sorted(BOUNDS))
    parser.add_argument("output")
    parser.add_argument("--max-zoom", type=int, default=11)
    parser.add_argument("--source", help="local or remote DEM to use instead of the NRCan defaults")
    args = parser.parse_args()
    if args.source:
        SOURCES.insert(0, args.source)
    west, south, east, north = BOUNDS[args.province]
    source, url = open_source()
    tiles: dict[int, bytes] = {}
    started = time.time()
    with WarpedVRT(source, crs="EPSG:3857", resampling=Resampling.bilinear) as vrt:
        # Overview zooms: one read per tile at that zoom.
        for zoom in range(MIN_ZOOM, BLOCK_ZOOM):
            for t in mercantile.tiles(west, south, east, north, zooms=zoom):
                dem, valid = read_block(vrt, t, TILE)
                for k, v in render(dem, valid, t, TILE).items():
                    tiles[zxy_to_tileid(k.z, k.x, k.y)] = v
            print(f"z{zoom}: {len(tiles)} tiles so far", flush=True)
        # Detail zooms: one DEM read per z8 block at max-zoom resolution, downsampled for the zooms in between.
        blocks = list(mercantile.tiles(west, south, east, north, zooms=BLOCK_ZOOM))
        size = TILE * 2 ** (args.max_zoom - BLOCK_ZOOM)
        for index, block in enumerate(blocks, 1):
            for attempt in range(3):
                try:
                    dem, valid = read_block(vrt, block, size)
                    break
                except Exception as error:  # noqa: BLE001
                    print("retry", block, error, flush=True)
                    time.sleep(5)
            else:
                continue
            if not valid.any():
                continue
            current, current_valid, current_size = dem, valid, size
            while True:
                for k, v in render(current, current_valid, block, current_size).items():
                    tiles[zxy_to_tileid(k.z, k.x, k.y)] = v
                if current_size == TILE:
                    break
                # Halve resolution for the next zoom out (keep a 1 px border).
                inner = current[1:-1, 1:-1]
                inner_valid = current_valid[1:-1, 1:-1]
                half = inner.reshape(current_size // 2, 2, current_size // 2, 2).mean(axis=(1, 3))
                half_valid = inner_valid.reshape(current_size // 2, 2, current_size // 2, 2).any(axis=(1, 3))
                current = np.pad(half, 1, mode="edge")
                current_valid = np.pad(half_valid, 1, mode="edge")
                current_size //= 2
            if index % 10 == 0 or index == len(blocks):
                print(f"block {index}/{len(blocks)}: {len(tiles)} tiles, {time.time() - started:.0f} s", flush=True)

    with open(args.output, "wb") as f:
        writer = Writer(f)
        for tile_id in sorted(tiles):
            writer.write_tile(tile_id, tiles[tile_id])
        writer.finalize(
            {
                "tile_type": TileType.WEBP,
                "tile_compression": Compression.NONE,
                "min_zoom": MIN_ZOOM,
                "max_zoom": args.max_zoom,
                "min_lon_e7": int(west * 1e7), "min_lat_e7": int(south * 1e7),
                "max_lon_e7": int(east * 1e7), "max_lat_e7": int(north * 1e7),
                "center_zoom": 8,
                "center_lon_e7": int((west + east) / 2 * 1e7), "center_lat_e7": int((south + north) / 2 * 1e7),
            },
            {
                "name": f"terrain-{args.province}",
                "type": "overlay",
                "format": "webp",
                "description": "Terrain shading (hillshade) overlay",
                "attribution": "Elevation © Natural Resources Canada, Open Government Licence – Canada",
                "source": url,
            },
        )
    digest = hashlib.sha256(open(args.output, "rb").read()).hexdigest()
    size_bytes = len(open(args.output, "rb").read())
    print(json.dumps({"id": args.province, "tiles": len(tiles), "bytes": size_bytes, "sha256": digest}), flush=True)


if __name__ == "__main__":
    main()
