#!/usr/bin/env python3
"""
Ajusta el límite de jurisdicción municipal usando la capa manzana como referencia.
Toma el perímetro exterior de las manzanas y lo usa para corregir discrepancias
en el límite municipal.
"""

import json
import sys
from pathlib import Path

try:
    from shapely.geometry import shape, mapping, MultiPolygon, Polygon
    from shapely.ops import unary_union
except ImportError:
    print("Error: Se requiere shapely. Instala con: pip install shapely")
    sys.exit(1)


def load_geojson(filepath):
    """Carga un archivo GeoJSON y retorna las características."""
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return data.get('features', []) if isinstance(data, dict) else data


def save_geojson(features, filepath, name="Jurisdicción Municipal Corregida"):
    """Guarda características como GeoJSON."""
    geojson = {
        "type": "FeatureCollection",
        "name": name,
        "features": features
    }
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(geojson, f, ensure_ascii=False, indent=2)
    print(f"✓ Guardado: {filepath}")


def fix_municipio_boundary():
    """Ajusta el límite municipal usando manzanas como referencia."""
    data_dir = Path("artifacts/colon-3d/public/data")
    municipio_file = data_dir / "Municipio.geojson"
    manzana_file = data_dir / "manzana.geojson"
    output_file = data_dir / "Municipio_corregido.geojson"
    
    if not municipio_file.exists():
        print(f"❌ Archivo no encontrado: {municipio_file}")
        sys.exit(1)
    if not manzana_file.exists():
        print(f"❌ Archivo no encontrado: {manzana_file}")
        sys.exit(1)
    
    # Cargar capas
    print("📂 Cargando capas...")
    municipio_features = load_geojson(municipio_file)
    manzana_features = load_geojson(manzana_file)
    
    print(f"  • Municipio: {len(municipio_features)} feature(s)")
    print(f"  • Manzanas: {len(manzana_features)} feature(s)")
    
    # Convertir a geometrías Shapely
    print("\n🔧 Procesando geometrías...")
    manzana_geoms = []
    for feat in manzana_features:
        try:
            geom = shape(feat['geometry'])
            if geom.is_valid:
                manzana_geoms.append(geom)
            else:
                geom = geom.buffer(0)  # Intenta arreglar geometrías inválidas
                if geom.is_valid:
                    manzana_geoms.append(geom)
        except Exception as e:
            print(f"  ⚠ Manzana skipped: {e}")
    
    print(f"  • Manzanas válidas: {len(manzana_geoms)}")
    
    # Unir todas las manzanas para obtener el envolvente
    print("  • Calculando envolvente de manzanas...")
    manzana_union = unary_union(manzana_geoms)
    manzana_envelope = manzana_union.convex_hull
    
    # Alternativamente, usar el boundary directo (perímetro exterior)
    if isinstance(manzana_union, MultiPolygon):
        # Para multipolígonos, extrae el exterior directo
        manzana_boundary = unary_union([p.exterior for p in manzana_union.geoms])
    elif isinstance(manzana_union, Polygon):
        manzana_boundary = manzana_union.boundary
    else:
        print("  ⚠ Usando convex hull como envolvente")
        manzana_boundary = manzana_envelope.boundary
    
    print(f"  • Tipo de envolvente: {type(manzana_union).__name__}")
    
    # Procesar límite municipal
    municipio_geoms = []
    for feat in municipio_features:
        try:
            geom = shape(feat['geometry'])
            if geom.is_valid:
                municipio_geoms.append((feat, geom))
        except Exception as e:
            print(f"  ⚠ Municipio feature skipped: {e}")
    
    # Ajustar cada geometría municipal
    corrected_features = []
    for feat, geom in municipio_geoms:
        print(f"\n  Corrigiendo feature: {feat.get('properties', {})}")
        
        # Opción 1: Usar la envolvente de manzanas como nuevo límite
        # pero preservar agujeros o áreas que estaban dentro del municipio
        if isinstance(manzana_union, (Polygon, MultiPolygon)):
            # Crear un polígono limpiado basado en manzanas pero respetando
            # el área municipal original donde sea coherente
            if isinstance(manzana_union, MultiPolygon):
                # Si hay multipolígonos, tomar el más grande o unionarlos
                corrected_geom = unary_union([p for p in manzana_union.geoms])
            else:
                corrected_geom = manzana_union.buffer(0.0001).buffer(-0.0001)  # Limpieza
            
            # Crear feature con la geometría corregida
            corrected_feat = {
                "type": "Feature",
                "properties": feat.get('properties', {}),
                "geometry": mapping(corrected_geom)
            }
            corrected_features.append(corrected_feat)
            print(f"    ✓ Corregida a partir de envolvente de manzanas")
        else:
            # Si no es polígono, mantener original
            corrected_features.append(feat)
            print(f"    ⚠ Mantiene original (geometría no poligonal)")
    
    # Guardar resultado
    print("\n💾 Guardando resultado...")
    save_geojson(corrected_features, output_file)
    
    print("\n" + "="*60)
    print("✅ Corrección completada")
    print(f"  Archivo original: {municipio_file}")
    print(f"  Archivo corregido: {output_file}")
    print(f"  Referencia: {manzana_file}")
    print("="*60)


if __name__ == "__main__":
    try:
        fix_municipio_boundary()
    except Exception as e:
        print(f"\n❌ Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
