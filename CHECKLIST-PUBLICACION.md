# ✅ CHECKLIST PUBLICACIÓN - CAPA OBRAS CATASTRO

**Fecha:** 20 de abril de 2026 | **Estado:** Listo para publicar  
**Responsable:** Municipalidad de Colón, Entre Ríos

---

## 📋 VERIFICACIÓN DE DATOS (Pre-Publicación)

- [ ] **Revisar métricas finales**
  - ✓ Total de obras: **211** (de 240 originales)
  - ✓ Obras geocodificadas (IGN): **112** 
  - ✓ Obras con ubicación verificada (close): **105** 🎯
  - ✓ Obras pendiente de ubicación: **93** ⚠️ (revisar en admin panel)
  - ✓ Casos **sin conflictos de distancia**: **0** ✅

- [ ] **Abrir Editor Admin en navegador**
  - Archivo: `LISTADO PLANOS-hasta-2026.xlsx - 2025(1).cadastral-admin-editor.html`
  - Ubicación: `artifacts/planos-cleaning/`
  - Contraseña: solicitada al administrador del sistema

- [ ] **Revisar obras con estado "missing_address_point"** (93 obras)
  - Opción A: Completar manualmente ubicación en formulario + guardar como `admin_new`
  - Opción B: Marcar como `deleted=true` si no tienen datos confiables
  - Opción C: Dejar para revisión posterior

- [ ] **Validar puntos de ubicación en mapa**
  - Hacer click en mapa para ajustar coordenadas si es necesario
  - Verificar que no hay puntos fuera del municipio
  - Confirmar concordancia con nomenclatura catastral

- [ ] **Exportar cambios adminitrativos**
  - Botón: "Exportar JSON admin cambios"
  - Guardar como: `LISTADO PLANOS-hasta-2026.xlsx - 2025(1).cadastral-admin-changes.json`
  - **Importante:** Archivar en carpeta de backups

---

## 🔄 CICLO DE ACTUALIZACIÓN (Si se hacen cambios)

1. **En el navegador admin:**
   - Agregar obras, corregir ubicaciones, marcar como borradas
   - Exportar JSON con cambios
   - Guardar en carpeta artifacts/planos-cleaning/

2. **En terminal PowerShell:**
   ```powershell
   cd C:\Users\HP\Downloads\Colon-Entre-Rios\scripts
   pnpm --filter @workspace/scripts geolocate:catastro
   ```
   
3. **Verificar salida:**
   - Ver métricas en terminal
   - Revisar CSV, JSON, HTML regenerados
   - Si estado es OK → pasar a publicación

---

## 📦 ARCHIVOS A PUBLICAR

### Opción 1: Publicación Rápida (Datos Geocodificados)
```
artifacts/planos-cleaning/
├── cadastral-geolocated.csv          ← CSV con ubicaciones
├── cadastral-geolocated.json         ← JSON con ubicaciones
└── cadastral-admin-editor.html       ← Editor web interactivo
```

**Campos incluidos:** nomenclatura catastral, ubicación, lat/lon, estado de verificación, fuente  
**Usuarios:** GIS team, cartografía municipal  
**Tamaño aprox:** ~2.5 MB

### Opción 2: Publicación Completa (Con datos de obras)  ⭐ **RECOMENDADO**
```
(a generar - ver próxima sección)
├── obras-completas.csv              ← Todos los 51 campos originales + geocodificación
├── obras-completas.json             ← Mismo contenido en JSON
├── obras-geojson.json               ← GeoJSON para SIG (geometría + propiedades)
└── admin-editor-completo.html       ← Editor web enriquecido
```

**Campos incluidos:** propietario, profesionales, constructor, m² construir, montos, fechas, observaciones, + ubicación  
**Usuarios:** municipalidad, profesionales, ciudadanía  
**Tamaño aprox:** ~5 MB

---

## 🔐 ACCESO Y PERMISOS

- [ ] **Editor Admin**: Requiere contraseña (almacenar en gestor de secretos)
- [ ] **CSV/JSON público**: Sin restricción (datos públicos)
- [ ] **GeoJSON para SIG**: Acceso municipal
- [ ] **Registro de cambios**: Auditoría en archivo `admin-changes.json`

---

## ✨ VALIDACIÓN FINAL (Checklist de Calidad)

- [ ] ✓ Sin duplicados en nomenclatura catastral
- [ ] ✓ Sin coordenadas NULL o inválidas  
- [ ] ✓ Todos los NCP en formato correcto (e.g., `0100010170020000--073--`)
- [ ] ✓ Fechas en formato ISO (YYYY-MM-DD)
- [ ] ✓ Montos sin símbolos de moneda (números puros)
- [ ] ✓ Puntos verdes (verificados) en ubicaciones correctas
- [ ] ✓ Admin override motivos documentados

---

## 🚀 PASOS FINALES

### Si TODO está correcto:

1. **Respaldar datos:**
   ```powershell
   Copy-Item "artifacts/planos-cleaning/" -Destination "backups/2026-04-20/" -Recurse
   ```

2. **Publicar archivos:**
   - Subir CSV a servidor de datos municipal
   - Subir GeoJSON a servidor GIS
   - Publicar HTML interactivo en web municipal

3. **Documentar:**
   - Generar metadata (fuente: IGN API, procesamiento: TypeScript pipeline)
   - Crear README con diccionario de campos
   - Registrar versión: `v1.0 - 2026-04-20`

4. **Comunicar:**
   - Notificar a stakeholders (GIS team, profesionales, propietarios)
   - Publicar nota de prensa si aplica

---

## 📞 CONTACTO Y SOPORTE

**Preguntas sobre datos?**  
- Contactar: equipo de municipalidad
- Repositorio: `Colon-Entre-Rios` (GitHub/GitLab)

**Problemas técnicos?**  
- Reejecutar pipeline: `pnpm geolocate:catastro`
- Revisar logs: terminal PowerShell
- Restaurar backups si es necesario

---

**Ultima actualización:** 2026-04-20  
**Próxima revisión recomendada:** Mensual o ante nuevas obras
