import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch, Router as WouterRouter } from "wouter";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppHeader } from "@/components/AppHeader";
import HomePage from "@/pages/HomePage";
import InscripcionPage from "@/pages/InscripcionPage";
import RegistrosPage from "@/pages/RegistrosPage";

const queryClient = new QueryClient();

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/">
        <AppLayout><HomePage /></AppLayout>
      </Route>
      <Route path="/registros">
        <AppLayout><RegistrosPage /></AppLayout>
      </Route>
      <Route path="/inscripcion">
        <AppLayout><InscripcionPage /></AppLayout>
      </Route>
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster richColors position="top-right" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
