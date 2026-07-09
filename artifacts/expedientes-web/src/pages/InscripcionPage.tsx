import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { z } from "zod";
import {
  createMatricula,
  fetchCatalogos,
  fetchMatriculaSuggest,
  type TipoProfesional,
  type TipoRegistro,
} from "@/api/tramites";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const tipoRegistroValues = [
  "profesional",
  "constructor",
  "empresa_constructora",
  "gestor_administrativo",
] as const;

const formSchema = z.object({
  tipoRegistro: z.enum(tipoRegistroValues),
  esJuridica: z.boolean(),
  apellido: z.string().optional(),
  nombres: z.string().optional(),
  razonSocial: z.string().optional(),
  dni: z.string().optional(),
  cuitCuil: z.string().optional(),
  domicilioCalle: z.string().optional(),
  domicilioNumero: z.string().optional(),
  domicilioLocalidad: z.string().default("Colón"),
  domicilioProvincia: z.string().default("Entre Ríos"),
  telefono: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  tipoProfesional: z.string().optional(),
  especializacion: z.string().optional(),
  matriculaMunicipal: z.string().optional(),
  matriculaColegio: z.string().optional(),
  colegioProfesional: z.string().optional(),
  representanteTecnicoTitulo: z.string().optional(),
  observaciones: z.string().optional(),
  aval1: z.string().optional(),
  aval2: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.tipoRegistro === "empresa_constructora" && !data.esJuridica) {
    ctx.addIssue({ code: "custom", message: "Debe ser persona jurídica", path: ["esJuridica"] });
  }
  if (!data.esJuridica) {
    if (!data.apellido?.trim()) ctx.addIssue({ code: "custom", message: "Requerido", path: ["apellido"] });
    if (!data.nombres?.trim()) ctx.addIssue({ code: "custom", message: "Requerido", path: ["nombres"] });
  } else if (!data.razonSocial?.trim()) {
    ctx.addIssue({ code: "custom", message: "Requerido", path: ["razonSocial"] });
  }
  if (data.tipoRegistro === "profesional" && !data.tipoProfesional) {
    ctx.addIssue({ code: "custom", message: "Seleccioná el título", path: ["tipoProfesional"] });
  }
  if (data.tipoRegistro === "constructor") {
    if (!data.aval1?.trim() || !data.aval2?.trim()) {
      ctx.addIssue({ code: "custom", message: "Se requieren dos avales", path: ["aval1"] });
    }
  }
});

type FormValues = z.infer<typeof formSchema>;

function parseTipoFromSearch(search: string): TipoRegistro | undefined {
  const params = new URLSearchParams(search);
  const tipo = params.get("tipo");
  if (tipo && (tipoRegistroValues as readonly string[]).includes(tipo)) {
    return tipo as TipoRegistro;
  }
  return undefined;
}

export default function InscripcionPage() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const initialTipo = parseTipoFromSearch(search) ?? "profesional";

  const catalogosQuery = useQuery({
    queryKey: ["catalogos"],
    queryFn: fetchCatalogos,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tipoRegistro: initialTipo,
      esJuridica: initialTipo === "empresa_constructora",
      domicilioLocalidad: "Colón",
      domicilioProvincia: "Entre Ríos",
    },
  });

  const tipoRegistro = form.watch("tipoRegistro");
  const esJuridica = form.watch("esJuridica");

  const suggestQuery = useQuery({
    queryKey: ["matricula-suggest", tipoRegistro],
    queryFn: () => fetchMatriculaSuggest(tipoRegistro),
    enabled: !!tipoRegistro,
  });

  useEffect(() => {
    if (suggestQuery.data?.matriculaMunicipal) {
      form.setValue("matriculaMunicipal", suggestQuery.data.matriculaMunicipal);
    }
  }, [suggestQuery.data?.matriculaMunicipal, form]);

  useEffect(() => {
    if (tipoRegistro === "empresa_constructora") {
      form.setValue("esJuridica", true);
    }
  }, [tipoRegistro, form]);

  const titulo = useMemo(() => {
    const labels = catalogosQuery.data?.tipoRegistro;
    return labels?.[tipoRegistro] ?? "Inscripción";
  }, [catalogosQuery.data, tipoRegistro]);

  const mutation = useMutation({
    mutationFn: createMatricula,
    onSuccess: (data) => {
      toast.success(`Inscripción registrada: ${data.matriculaMunicipal}`);
      queryClient.invalidateQueries({ queryKey: ["matriculas"] });
      navigate("/registros");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  function onSubmit(values: FormValues) {
    mutation.mutate({
      tipoRegistro: values.tipoRegistro,
      tipoProfesional: values.tipoProfesional as TipoProfesional | undefined,
      especializacion: values.especializacion,
      matriculaMunicipal: values.matriculaMunicipal,
      matriculaColegio: values.matriculaColegio,
      colegioProfesional: values.colegioProfesional,
      representanteTecnicoTitulo: values.representanteTecnicoTitulo,
      observaciones: values.observaciones,
      persona: {
        esJuridica: values.esJuridica,
        apellido: values.apellido,
        nombres: values.nombres,
        razonSocial: values.razonSocial,
        dni: values.dni,
        cuitCuil: values.cuitCuil,
        domicilioCalle: values.domicilioCalle,
        domicilioNumero: values.domicilioNumero,
        domicilioLocalidad: values.domicilioLocalidad,
        domicilioProvincia: values.domicilioProvincia,
        telefono: values.telefono,
        email: values.email,
      },
      avales: values.tipoRegistro === "constructor"
        ? [
            { nombreAvalistaTexto: values.aval1 },
            { nombreAvalistaTexto: values.aval2 },
          ]
        : undefined,
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Nueva inscripción — {titulo}</CardTitle>
          <CardDescription>
            Completá los datos según la planilla oficial. La matrícula municipal se asigna automáticamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="tipoRegistro"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de inscripción</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar tipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {catalogosQuery.data && Object.entries(catalogosQuery.data.tipoRegistro).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {tipoRegistro === "empresa_constructora" && (
                <FormField
                  control={form.control}
                  name="esJuridica"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-3 rounded-md border p-3">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} disabled />
                      </FormControl>
                      <div>
                        <FormLabel>Persona jurídica</FormLabel>
                        <FormDescription>Las empresas constructoras se registran como persona jurídica.</FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
              )}

              <Separator />

              <div className="grid gap-4 md:grid-cols-2">
                {!esJuridica ? (
                  <>
                    <FormField control={form.control} name="apellido" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Apellido</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="nombres" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombres</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </>
                ) : (
                  <FormField control={form.control} name="razonSocial" render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Razón social</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}

                <FormField control={form.control} name="dni" render={({ field }) => (
                  <FormItem>
                    <FormLabel>DNI</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="cuitCuil" render={({ field }) => (
                  <FormItem>
                    <FormLabel>CUIT/CUIL</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="domicilioCalle" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Domicilio — calle</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="domicilioNumero" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="telefono" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teléfono</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl><Input type="email" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {tipoRegistro === "profesional" && (
                <>
                  <Separator />
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField control={form.control} name="tipoProfesional" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Título / profesión</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {catalogosQuery.data && Object.entries(catalogosQuery.data.tipoProfesional).map(([value, label]) => (
                              <SelectItem key={value} value={value}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="matriculaColegio" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Matrícula del colegio</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="colegioProfesional" render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Colegio profesional</FormLabel>
                        <FormControl><Input placeholder="CAPER, CIAER, etc." {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="especializacion" render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Especialización (opcional)</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </>
              )}

              {tipoRegistro === "empresa_constructora" && (
                <>
                  <Separator />
                  <FormField control={form.control} name="representanteTecnicoTitulo" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Representante técnico — título</FormLabel>
                      <FormControl><Input placeholder="ING., ARQ., MMO." {...field} /></FormControl>
                      <FormDescription>Nombre y matrícula del representante se vincularán en una etapa posterior.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                </>
              )}

              {tipoRegistro === "constructor" && (
                <>
                  <Separator />
                  <Alert>
                    <AlertDescription>
                      Los constructores requieren aval de dos profesionales matriculados.
                    </AlertDescription>
                  </Alert>
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField control={form.control} name="aval1" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Aval profesional 1</FormLabel>
                        <FormControl><Input placeholder="Nombre y matrícula" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="aval2" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Aval profesional 2</FormLabel>
                        <FormControl><Input placeholder="Nombre y matrícula" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </>
              )}

              <Separator />

              <div className="grid gap-4 md:grid-cols-2">
                <FormField control={form.control} name="matriculaMunicipal" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Matrícula municipal</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormDescription>Sugerida automáticamente. Podés editarla para preservar un código histórico.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="observaciones" render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Observaciones</FormLabel>
                    <FormControl><Textarea rows={3} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => navigate("/registros")}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? "Guardando..." : "Registrar inscripción"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
