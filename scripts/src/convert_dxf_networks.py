import json
import math
from pathlib import Path

import ezdxf
from shapely.geometry import LineString, Polygon, MultiPolygon
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "artifacts" / "colon-3d" / "public" / "data"


def load_geojson(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def polygon_from_feature_geometry(geometry):
    t = geometry.get("type")
    coords = geometry.get("coordinates")
    if t == "Polygon":
        return Polygon(coords[0], holes=coords[1:])
    if t == "MultiPolygon":
        polys = [Polygon(p[0], holes=p[1:]) for p in coords]
        return unary_union(polys)
    return None


def build_urban_mask_from_barrios():
    barrios = load_geojson(DATA_DIR / "barrios.geojson")
    polys = []
    for f in barrios.get("features", []):
        g = f.get("geometry")
        if not g:
            continue
        p = polygon_from_feature_geometry(g)
        if p is not None and not p.is_empty:
            polys.append(p)
    if not polys:
        raise RuntimeError("No se pudo construir máscara urbana desde barrios.geojson")
    return unary_union(polys)


def centroid_of_points(points):
    sx = sum(p[0] for p in points)
    sy = sum(p[1] for p in points)
    n = max(1, len(points))
    return (sx / n, sy / n)


def principal_axis(points):
    cx, cy = centroid_of_points(points)
    sxx = sxy = syy = 0.0
    for x, y in points:
        dx = x - cx
        dy = y - cy
        sxx += dx * dx
        sxy += dx * dy
        syy += dy * dy
    # angle of first principal component
    theta = 0.5 * math.atan2(2.0 * sxy, (sxx - syy))
    # std along principal axis for scale estimation
    ct = math.cos(theta)
    st = math.sin(theta)
    proj = [(x - cx) * ct + (y - cy) * st for x, y in points]
    mean_p = sum(proj) / max(1, len(proj))
    var_p = sum((p - mean_p) ** 2 for p in proj) / max(1, len(proj))
    return theta, math.sqrt(max(var_p, 1e-12)), (cx, cy)


def sample_polygon_boundary(poly, step=0.001):
    pts = []
    rings = []
    if isinstance(poly, Polygon):
        rings = [poly.exterior]
    elif isinstance(poly, MultiPolygon):
        rings = [p.exterior for p in poly.geoms]
    for ring in rings:
        length = ring.length
        n = max(16, int(length / max(step, 1e-6)))
        for i in range(n):
            d = (i / n) * length
            p = ring.interpolate(d)
            pts.append((p.x, p.y))
    return pts


def build_similarity_transform(src_points, dst_points):
    src_theta, src_sigma, src_center = principal_axis(src_points)
    dst_theta, dst_sigma, dst_center = principal_axis(dst_points)

    scale = dst_sigma / src_sigma
    rot = dst_theta - src_theta
    ct = math.cos(rot)
    st = math.sin(rot)
    scx, scy = src_center
    dcx, dcy = dst_center

    def transform(pt):
        x, y = pt
        x0 = x - scx
        y0 = y - scy
        xr = (x0 * ct - y0 * st) * scale
        yr = (x0 * st + y0 * ct) * scale
        return [dcx + xr, dcy + yr]

    return transform


def entity_points(entity):
    t = entity.dxftype()
    if t == "LINE":
        s = entity.dxf.start
        e = entity.dxf.end
        return [[float(s.x), float(s.y)], [float(e.x), float(e.y)]]

    if t == "LWPOLYLINE":
        pts = []
        for p in entity.get_points("xy"):
            pts.append([float(p[0]), float(p[1])])
        if len(pts) >= 2 and entity.closed and pts[0] != pts[-1]:
            pts.append(pts[0])
        return pts

    if t == "POLYLINE":
        pts = []
        for v in entity.vertices:
            pts.append([float(v.dxf.location.x), float(v.dxf.location.y)])
        if len(pts) >= 2 and entity.is_closed and pts[0] != pts[-1]:
            pts.append(pts[0])
        return pts

    if t == "ARC":
        c = entity.dxf.center
        r = float(entity.dxf.radius)
        a0 = math.radians(float(entity.dxf.start_angle))
        a1 = math.radians(float(entity.dxf.end_angle))
        if a1 < a0:
            a1 += 2 * math.pi
        steps = max(8, int((a1 - a0) / (math.pi / 24)))
        pts = []
        for i in range(steps + 1):
            a = a0 + (a1 - a0) * i / steps
            pts.append([float(c.x) + r * math.cos(a), float(c.y) + r * math.sin(a)])
        return pts

    return []


def bbox_from_points(points):
    min_x = min(p[0] for p in points)
    max_x = max(p[0] for p in points)
    min_y = min(p[1] for p in points)
    max_y = max(p[1] for p in points)
    return (min_x, min_y, max_x, max_y)


def extract_features(dxf_path: Path, keep_layers, calib_layers):
    doc = ezdxf.readfile(str(dxf_path))
    msp = doc.modelspace()

    calib_points = []
    raw_features = []

    for e in msp:
        layer = e.dxf.layer
        pts = entity_points(e)
        if len(pts) < 2:
            continue

        for c in calib_layers:
            if layer.lower() == c.lower():
                calib_points.extend(pts)
                break

        for k in keep_layers:
            if k(layer):
                raw_features.append({
                    "layer": layer,
                    "type": e.dxftype(),
                    "coords": pts,
                })
                break

    if len(calib_points) < 2:
        # fallback to all raw feature points if no dedicated calibration layer was found
        for f in raw_features:
            calib_points.extend(f["coords"])

    if len(calib_points) < 2:
        raise RuntimeError(f"No se encontraron puntos para calibrar en {dxf_path.name}")

    return raw_features, bbox_from_points(calib_points)


def to_geojson(raw_features, transform, source_name):
    features = []
    for f in raw_features:
        coords = [transform(p) for p in f["coords"]]
        if len(coords) < 2:
            continue
        features.append({
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": coords},
            "properties": {
                "source": source_name,
                "layer": f["layer"],
                "entity": f["type"],
            },
        })
    return {"type": "FeatureCollection", "features": features}


def clip_geojson_to_mask(geojson_obj, mask_poly):
    out = []
    for f in geojson_obj.get("features", []):
        g = f.get("geometry")
        if not g or g.get("type") != "LineString":
            continue
        coords = g.get("coordinates") or []
        if len(coords) < 2:
            continue
        line = LineString(coords)
        inter = line.intersection(mask_poly)
        if inter.is_empty:
            continue
        if inter.geom_type == "LineString":
            out.append({
                "type": "Feature",
                "geometry": {"type": "LineString", "coordinates": list(inter.coords)},
                "properties": f.get("properties", {}),
            })
        elif inter.geom_type == "MultiLineString":
            for part in inter.geoms:
                if len(part.coords) < 2:
                    continue
                out.append({
                    "type": "Feature",
                    "geometry": {"type": "LineString", "coordinates": list(part.coords)},
                    "properties": f.get("properties", {}),
                })
    return {"type": "FeatureCollection", "features": out}


def main():
    urban_mask = build_urban_mask_from_barrios()
    urban_target_pts = sample_polygon_boundary(urban_mask, step=0.0007)

    # Gas network from PLANO COLON GAS.dxf
    gas_raw, _ = extract_features(
        ROOT / "PLANO COLON GAS.dxf",
        keep_layers=[
            lambda n: n.upper().startswith("GAS"),
            lambda n: n.upper() == "RED FUTURA",
        ],
        calib_layers=["Manzanas", "Numeros de Manzanas"],
    )
    # For gas DXF use similarity transform against urban mask boundary
    gas_src_pts = []
    for feat in gas_raw:
        gas_src_pts.extend(feat["coords"])
    gas_tf = build_similarity_transform(gas_src_pts, urban_target_pts)
    gas_geo = to_geojson(gas_raw, gas_tf, "PLANO COLON GAS.dxf")
    gas_geo = clip_geojson_to_mask(gas_geo, urban_mask)
    gas_out = DATA_DIR / "gas_red_dxf.geojson"
    gas_out.write_text(json.dumps(gas_geo), encoding="utf-8")

    # Electric network from Unifilar.dxf
    elec_raw, _ = extract_features(
        ROOT / "Unifilar.dxf",
        keep_layers=[
            lambda n: n.upper() == "ELECTRICA ENERSA",
        ],
        calib_layers=[],
    )
    # For unifilar use similarity transform against ENERSA urban network
    elec_src_pts = []
    for feat in elec_raw:
        elec_src_pts.extend(feat["coords"])
    # Use urban mask as final extent constraint
    elec_tf = build_similarity_transform(elec_src_pts, urban_target_pts)
    elec_geo = to_geojson(elec_raw, elec_tf, "Unifilar.dxf")
    elec_geo = clip_geojson_to_mask(elec_geo, urban_mask)
    elec_out = DATA_DIR / "enersa_unifilar_dxf.geojson"
    elec_out.write_text(json.dumps(elec_geo), encoding="utf-8")

    print(f"Gas DXF -> {gas_out} ({len(gas_geo['features'])} features)")
    print(f"Unifilar DXF -> {elec_out} ({len(elec_geo['features'])} features)")


if __name__ == "__main__":
    main()
