export interface ZonaNormas {
  nomenclatura: string;
  categoria?: string;
  nombre: string;
  color: string;
  fos: string;
  fot: string;
  alturaMax: string;
  retiroLM: string;
  retiroMedianera: string;
  sueloAbsorbente: string;
  observaciones?: string;
}

// Fuente: Ordenanza 130/22 — Colón, Entre Ríos
// Datos verificados del archivo Excel oficial (zonas_1776389149636.xlsx)
// Columnas: Zona, Categoría, Nomenclatura, FOS, FOT, Altura Máx., Retiro LM, Retiro Medianera, Suelo Absorbente
// Nota: Altura Máx. para zonas Centro (0,70) y Urbana (0,60) es COEFICIENTE de plano límite de sombras
// (H_max = distancia_retiro × coef), no metros absolutos.

export const ZONA_NORMAS: Record<string, ZonaNormas[]> = {
  "CENTRO": [
    {
      nomenclatura: "ZC-A",
      categoria: "A",
      nombre: "Zona Centro — Cat. A",
      color: "#e03030",
      fos: "0,75",
      fot: "2,00",
      alturaMax: "Plano límite de sombras — coef. 0,70",
      retiroLM: "Sin retiro",
      retiroMedianera: "Sin retiro",
      sueloAbsorbente: "12%",
      observaciones: "Cuando no se edifique: retardadores pluviométricos y/o terrazas verdes obligatorias."
    },
    {
      nomenclatura: "ZC-B",
      categoria: "B",
      nombre: "Zona Centro — Cat. B",
      color: "#e03030",
      fos: "0,85",
      fot: "2,50",
      alturaMax: "Plano límite de sombras — coef. 0,70",
      retiroLM: "Sin retiro",
      retiroMedianera: "Sin retiro",
      sueloAbsorbente: "12%",
      observaciones: "Cuando no se edifique: retardadores pluviométricos y/o terrazas verdes obligatorias."
    },
    {
      nomenclatura: "ZC-C",
      categoria: "C",
      nombre: "Zona Centro — Cat. C",
      color: "#e03030",
      fos: "1,00",
      fot: "2,50",
      alturaMax: "Plano límite de sombras — coef. 0,70",
      retiroLM: "Sin retiro",
      retiroMedianera: "Sin retiro",
      sueloAbsorbente: "12%",
      observaciones: "Cuando no se edifique: retardadores pluviométricos y/o terrazas verdes obligatorias."
    },
  ],
  "URBANA": [
    {
      nomenclatura: "ZU-A",
      categoria: "A",
      nombre: "Núcleo Urbano — Cat. A",
      color: "#ff5522",
      fos: "0,60",
      fot: "1,50",
      alturaMax: "Plano límite de sombras — coef. 0,60",
      retiroLM: "3,00 m",
      retiroMedianera: "3,00 m",
      sueloAbsorbente: "12%",
      observaciones: "Cuando no se edifique: retardadores pluviométricos y/o terrazas verdes obligatorias."
    },
    {
      nomenclatura: "ZU-B",
      categoria: "B",
      nombre: "Núcleo Urbano — Cat. B",
      color: "#ff5522",
      fos: "0,75",
      fot: "2,00",
      alturaMax: "Plano límite de sombras — coef. 0,60",
      retiroLM: "3,00 m",
      retiroMedianera: "3,00 m",
      sueloAbsorbente: "12%",
      observaciones: "Cuando no se edifique: retardadores pluviométricos y/o terrazas verdes obligatorias."
    },
    {
      nomenclatura: "ZU-C",
      categoria: "C",
      nombre: "Núcleo Urbano — Cat. C",
      color: "#ff5522",
      fos: "0,80",
      fot: "2,00",
      alturaMax: "Plano límite de sombras — coef. 0,60",
      retiroLM: "3,00 m",
      retiroMedianera: "3,00 m",
      sueloAbsorbente: "12%",
      observaciones: "Cuando no se edifique: retardadores pluviométricos y/o terrazas verdes obligatorias."
    },
  ],
  "PERIURBANA": [
    {
      nomenclatura: "ZP",
      nombre: "Zona Periurbana",
      color: "#90ee10",
      fos: "0,40",
      fot: "1,50",
      alturaMax: "10 m",
      retiroLM: "6,00 m",
      retiroMedianera: "3,00 m (semicubierto hasta 1,5 m de EM)",
      sueloAbsorbente: "30%",
    },
  ],
  "PERIURBANA-AMP SERVICIOS": [
    {
      nomenclatura: "ZP",
      nombre: "Periurbana — Ampliación Servicios",
      color: "#ff9922",
      fos: "0,40",
      fot: "1,50",
      alturaMax: "10 m",
      retiroLM: "6,00 m",
      retiroMedianera: "3,00 m (semicubierto hasta 1,5 m de EM)",
      sueloAbsorbente: "30%",
    },
  ],
  "PERIURBANA-COL HUGHES": [
    {
      nomenclatura: "HU",
      nombre: "Colonia Hughes",
      color: "#ff7755",
      fos: "0,40",
      fot: "1,50",
      alturaMax: "10 m",
      retiroLM: "3,00 m",
      retiroMedianera: "3,00 m (semicubierto hasta 1,5 m de EM)",
      sueloAbsorbente: "30%",
    },
  ],
  "QUINTAS": [
    {
      nomenclatura: "ZQ",
      nombre: "Zona de Quintas",
      color: "#ff80df",
      fos: "0,30",
      fot: "0,50",
      alturaMax: "10 m",
      retiroLM: "10,00 m",
      retiroMedianera: "6,00 m",
      sueloAbsorbente: "50%",
    },
  ],
  "CHACRAS": [
    {
      nomenclatura: "ZCH",
      nombre: "Zona de Chacras",
      color: "#00ffbf",
      fos: "0,30",
      fot: "0,50",
      alturaMax: "10 m",
      retiroLM: "10,00 m",
      retiroMedianera: "6,00 m",
      sueloAbsorbente: "50%",
    },
  ],
  "INDUSTRIAL": [
    {
      nomenclatura: "ZI",
      nombre: "Zona Industrial",
      color: "#ffee00",
      fos: "0,60",
      fot: "1,00",
      alturaMax: "Limitada por coeficiente de abatimiento",
      retiroLM: "10,00 m",
      retiroMedianera: "4,00 m",
      sueloAbsorbente: "30%",
    },
  ],
  "MIXTA COMPLEMENTO AREA INDUSTR": [
    {
      nomenclatura: "ZCAI",
      nombre: "Zona Compl. Área Industrial",
      color: "#5599ff",
      fos: "0,60",
      fot: "1,00",
      alturaMax: "10 m",
      retiroLM: "10,00 m",
      retiroMedianera: "4,00 m",
      sueloAbsorbente: "30%",
    },
  ],
  "AMORTIGUACION AMBIENTAL II": [
    {
      nomenclatura: "AA-II",
      nombre: "Amortiguación Ambiental II",
      color: "#3366ff",
      fos: "—",
      fot: "—",
      alturaMax: "—",
      retiroLM: "—",
      retiroMedianera: "—",
      sueloAbsorbente: "—",
      observaciones: "Zona de amortiguación entre usos industriales y residenciales. Ver Ord. 130/22."
    },
  ],
  "AREA PROTEGIDA NORTE": [
    {
      nomenclatura: "AP-N",
      nombre: "Área Protegida Norte",
      color: "#22aa00",
      fos: "—",
      fot: "—",
      alturaMax: "Sin urbanización",
      retiroLM: "—",
      retiroMedianera: "—",
      sueloAbsorbente: "—",
      observaciones: "Reserva natural costera. Sin urbanización ni subdivisión. Ver Ord. 130/22."
    },
  ],
  "AREA PROTEGIDA SUR": [
    {
      nomenclatura: "AP-S",
      nombre: "Área Protegida Sur",
      color: "#33bb11",
      fos: "—",
      fot: "—",
      alturaMax: "Sin urbanización",
      retiroLM: "—",
      retiroMedianera: "—",
      sueloAbsorbente: "—",
      observaciones: "Reserva natural costera. Sin urbanización ni subdivisión. Ver Ord. 130/22."
    },
  ],
  "RURAL": [
    {
      nomenclatura: "ZR",
      nombre: "Zona Rural",
      color: "#cc00cc",
      fos: "0,30",
      fot: "0,50",
      alturaMax: "10 m",
      retiroLM: "10,00 m",
      retiroMedianera: "10,00 m",
      sueloAbsorbente: "80%",
    },
  ],
};
