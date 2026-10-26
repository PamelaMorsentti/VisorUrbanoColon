import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { fetchCatalogos, fetchMatriculas, updateMatriculaEstado, type EstadoRegistro, type TipoRegistro } from "@/api/tramites";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

const ESTADO_VARIANT: Record<EstadoRegistro, "default" | "secondary" | "destructive" | "outline"> = {
  activo: "default",
  pendiente_documentacion: "secondary",
  suspendido: "outline",
  baja: "destructive",
};

export default function RegistrosPage() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [tipoRegistro, setTipoRegistro] = useState<TipoRegistro | "all">("all");
  const [estado, setEstado] = useState<EstadoRegistro | "all">("all");

  const catalogosQuery = useQuery({
    queryKey: ["catalogos"],
    queryFn: fetchCatalogos,
  });

  const listQuery = useQuery({
    queryKey: ["matriculas", q, tipoRegistro, estado],
    queryFn: () => fetchMatriculas({
      q: q || undefined,
      tipoRegistro: tipoRegistro === "all" ? undefined : tipoRegistro,
      estado: estado === "all" ? undefined : estado,
      limit: 100,
    }),
  });

  const catalogos = catalogosQuery.data;
  const items = listQuery.data?.items ?? [];

  const subtitle = useMemo(() => {
    const total = listQuery.data?.total ?? 0;
    return `${total} registro${total === 1 ? "" : "s"}`;
  }, [listQuery.data?.total]);

  async function activar(id: string) {
    try {
      await updateMatriculaEstado(id, { estado: "activo" });
      toast.success("Registro activado");
      await queryClient.invalidateQueries({ queryKey: ["matriculas"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo activar");
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Registros habilitados</CardTitle>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por nombre, matrícula, DNI o CUIT..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            <Select value={tipoRegistro} onValueChange={(v) => setTipoRegistro(v as TipoRegistro | "all")}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo de registro" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                {catalogos && Object.entries(catalogos.tipoRegistro).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={estado} onValueChange={(v) => setEstado(v as EstadoRegistro | "all")}>
              <SelectTrigger>
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                {catalogos && Object.entries(catalogos.estadoRegistro).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {listQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Cargando registros...</p>
          )}

          {listQuery.isError && (
            <p className="text-sm text-destructive">
              {listQuery.error instanceof Error ? listQuery.error.message : "Error al cargar"}
            </p>
          )}

          {!listQuery.isLoading && items.length === 0 && (
            <p className="text-sm text-muted-foreground">No hay registros para los filtros seleccionados.</p>
          )}

          {items.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.matriculaMunicipal}</TableCell>
                    <TableCell>{item.persona?.nombreCompleto ?? "—"}</TableCell>
                    <TableCell>
                      {catalogos?.tipoRegistro[item.tipoRegistro] ?? item.tipoRegistro}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ESTADO_VARIANT[item.estado]}>
                        {catalogos?.estadoRegistro[item.estado] ?? item.estado}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {item.estado === "pendiente_documentacion" && (
                        <Button size="sm" variant="outline" onClick={() => activar(item.id)}>
                          Activar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
