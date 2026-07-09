import { Link } from "wouter";
import { ArrowRight, ClipboardList, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const TIPOS = [
  {
    title: "Profesional",
    description: "Arquitectos, ingenieros, técnicos y especialistas matriculados.",
    href: "/inscripcion?tipo=profesional",
  },
  {
    title: "Constructor",
    description: "Constructores individuales con aval de dos profesionales.",
    href: "/inscripcion?tipo=constructor",
  },
  {
    title: "Empresa constructora",
    description: "Personas jurídicas con representante técnico habilitado.",
    href: "/inscripcion?tipo=empresa_constructora",
  },
  {
    title: "Gestor administrativo",
    description: "Gestores habilitados para tramitar expedientes.",
    href: "/inscripcion?tipo=gestor_administrativo",
  },
] as const;

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-900">Registro de habilitados</h2>
        <p className="mt-2 max-w-3xl text-slate-600">
          Comenzá por el registro de profesionales, constructores, empresas constructoras
          y gestores administrativos. Cada inscripción genera una matrícula municipal
          y queda en estado pendiente de documentación hasta su validación.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/inscripcion">
              <UserPlus className="h-4 w-4" />
              Nueva inscripción
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/registros">
              <ClipboardList className="h-4 w-4" />
              Ver registros
            </Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {TIPOS.map((tipo) => (
          <Card key={tipo.title}>
            <CardHeader>
              <CardTitle>{tipo.title}</CardTitle>
              <CardDescription>{tipo.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" asChild>
                <Link href={tipo.href}>
                  Inscribir
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
