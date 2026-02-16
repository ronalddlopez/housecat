import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { ProtectedRoute } from "@/components/protected-route";
import { useUserSync } from "@/hooks/use-user-sync";
import { UserButton } from "@clerk/clerk-react";
import LandingPage from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import TestsPage from "@/pages/tests";
import TestDetailPage from "@/pages/test-detail";
import RunTestPage from "@/pages/run-test";
import SettingsPage from "@/pages/settings";
import NotFound from "@/pages/not-found";

function AppLayout() {
  useUserSync();

  const style = {
    "--sidebar-width": "15rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-2 h-12 px-3 border-b bg-background shrink-0">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <UserButton afterSignOutUrl="/" />
            </div>
          </header>
          <main className="flex-1 overflow-y-auto">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
              <Switch>
                <Route path="/dashboard" component={Dashboard} />
                <Route path="/tests/:id" component={TestDetailPage} />
                <Route path="/tests" component={TestsPage} />
                <Route path="/run" component={RunTestPage} />
                <Route path="/settings" component={SettingsPage} />
                <Route component={NotFound} />
              </Switch>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route>
        <ProtectedRoute>
          <AppLayout />
        </ProtectedRoute>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
