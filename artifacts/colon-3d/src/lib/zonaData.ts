export interface ZonaNormas {
  zona: string;
  color: string;
  fos: string;
  fot: string;
  alturaMax: string;
  retiroFrente: string;
  retiroLateral: string;
  retiroPosterior: string;
  usos: string;
  nota?: string;
}

export const ZONA_NORMAS: Record<string, ZonaNormas> = {
  "CENTRO": {
    zona: "CENTRO",
    color: "#e03030",
    fos: "0,70",
    fot: "3,00",
    alturaMax: "Sin limitación (Ord. 130/22 Art. 8)",
    retiroFrente: "0 m",
    retiroLateral: "0 m",
    retiroPosterior: "0 m",
    usos: "Residencial, comercial, servicios, institucional",
    nota: "Área central de mayor densidad constructiva. Verificar alturas según Ord. 130/22."
  },
  "URBANA": {
    zona: "URBANA",
    color: "#ff5522",
    fos: "0,60",
    fot: "1,80",
    alturaMax: "12 m (PB + 2 plantas)",
    retiroFrente: "3 m",
    retiroLateral: "0 m",
    retiroPosterior: "3 m",
    usos: "Residencial unifamiliar y plurifamiliar, comercio barrial, servicios"
  },
  "PERIURBANA": {
    zona: "PERIURBANA",
    color: "#90ee10",
    fos: "0,50",
    fot: "0,90",
    alturaMax: "9 m (PB + 1 planta)",
    retiroFrente: "5 m",
    retiroLateral: "1,50 m",
    retiroPosterior: "5 m",
    usos: "Residencial de baja densidad, huertas, pequeños comercios"
  },
  "PERIURBANA-AMP SERVICIOS": {
    zona: "PERIURBANA - AMP. SERVICIOS",
    color: "#ff9922",
    fos: "0,50",
    fot: "0,90",
    alturaMax: "9 m (PB + 1 planta)",
    retiroFrente: "5 m",
    retiroLateral: "1,50 m",
    retiroPosterior: "5 m",
    usos: "Residencial, comercio de servicios, talleres no molestos"
  },
  "PERIURBANA-COL HUGHES": {
    zona: "PERIURBANA - COL. HUGHES",
    color: "#ff7755",
    fos: "0,50",
    fot: "0,80",
    alturaMax: "9 m (PB + 1 planta)",
    retiroFrente: "5 m",
    retiroLateral: "1,50 m",
    retiroPosterior: "5 m",
    usos: "Residencial de baja densidad"
  },
  "QUINTAS": {
    zona: "QUINTAS",
    color: "#ff80df",
    fos: "0,30",
    fot: "0,30",
    alturaMax: "7 m (PB + 1 planta)",
    retiroFrente: "7 m",
    retiroLateral: "3 m",
    retiroPosterior: "7 m",
    usos: "Residencial en lotes de mayor superficie, horticultura, floricultura"
  },
  "CHACRAS": {
    zona: "CHACRAS",
    color: "#00ffbf",
    fos: "0,15",
    fot: "0,15",
    alturaMax: "7 m",
    retiroFrente: "10 m",
    retiroLateral: "5 m",
    retiroPosterior: "10 m",
    usos: "Agropecuario extensivo, residencial aislado, turismo rural"
  },
  "INDUSTRIAL": {
    zona: "INDUSTRIAL",
    color: "#ffee00",
    fos: "0,60",
    fot: "1,20",
    alturaMax: "Sin limitación por proceso productivo",
    retiroFrente: "10 m",
    retiroLateral: "5 m",
    retiroPosterior: "10 m",
    usos: "Industria mediana y pesada, logística, depósitos"
  },
  "MIXTA COMPLEMENTO AREA INDUSTR": {
    zona: "MIXTA COMPLEMENT. INDUSTRIAL",
    color: "#5599ff",
    fos: "0,60",
    fot: "1,20",
    alturaMax: "12 m",
    retiroFrente: "5 m",
    retiroLateral: "2,50 m",
    retiroPosterior: "5 m",
    usos: "Industria liviana, talleres, comercio mayorista"
  },
  "AMORTIGUACION AMBIENTAL II": {
    zona: "AMORTIGUACIÓN AMBIENTAL II",
    color: "#3366ff",
    fos: "0,10",
    fot: "0,10",
    alturaMax: "7 m",
    retiroFrente: "10 m",
    retiroLateral: "5 m",
    retiroPosterior: "10 m",
    usos: "Amortiguación entre zonas industriales y residenciales. Usos condicionados."
  },
  "AREA PROTEGIDA NORTE": {
    zona: "ÁREA PROTEGIDA NORTE",
    color: "#22aa00",
    fos: "0,05",
    fot: "0,05",
    alturaMax: "Sin construcción permanente",
    retiroFrente: "—",
    retiroLateral: "—",
    retiroPosterior: "—",
    usos: "Reserva natural, espacio verde, turismo ecológico. Sin urbanización."
  },
  "AREA PROTEGIDA SUR": {
    zona: "ÁREA PROTEGIDA SUR",
    color: "#33bb11",
    fos: "0,05",
    fot: "0,05",
    alturaMax: "Sin construcción permanente",
    retiroFrente: "—",
    retiroLateral: "—",
    retiroPosterior: "—",
    usos: "Reserva natural costera. Sin urbanización."
  },
  "RURAL": {
    zona: "RURAL",
    color: "#cc00cc",
    fos: "0,05",
    fot: "0,05",
    alturaMax: "7 m",
    retiroFrente: "20 m",
    retiroLateral: "10 m",
    retiroPosterior: "20 m",
    usos: "Uso agropecuario, residencia rural, infraestructura de campo"
  },
  "": {
    zona: "—",
    color: "#888888",
    fos: "—",
    fot: "—",
    alturaMax: "—",
    retiroFrente: "—",
    retiroLateral: "—",
    retiroPosterior: "—",
    usos: "—"
  }
};
