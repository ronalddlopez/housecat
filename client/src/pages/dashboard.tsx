import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  CheckCircle2,
  XCircle,
  FlaskConical,
  Play,
  Clock,
  Pause,
  Activity,
  Loader2,
} from "lucide-react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { TestForm, FormState, emptyForm } from "@/components/test-form";

interface DashboardData {
  total_tests: number;
  active_tests: number;
  paused_tests: number;
  passing: number;
  failing: number;
  pending: number;
  last_run_at_global: string | null;
  next_run_approx_minutes: number | null;
  recent_runs: {
    test_id: string;
    test_name: string;
    test_url: string;
    last_result: string;
    last_run_at: string;
    steps_passed: number | null;
    steps_total: number | null;
    duration_ms: number | null;
    triggered_by: string | null;
  }[];
}

export default function Dashboard() {
  const { data } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
    refetchInterval: 30000,
  });

  useQuery({
    queryKey: ["/api/tests"],
    refetchInterval: 30000,
  });

  const total = data?.total_tests ?? 0;
  const active = data?.active_tests ?? 0;
  const passing = data?.passing ?? 0;
  const failing = data?.failing ?? 0;
  const pending = data?.pending ?? 0;
  const recentRuns = data?.recent_runs ?? [];

  // Create form state
  const [form, setForm] = useState<FormState>(emptyForm);

  const createMutation = useMutation({
    mutationFn: (body: FormState) => apiRequest("POST", "/api/tests", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      setForm(emptyForm);
    },
  });

  const formValid =
    form.name.trim().length > 0 &&
    form.url.trim().length > 0 &&
    form.goal.trim().length > 0;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Overview of your test runs and system status
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card data-testid="card-metric-total">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-md p-2.5 bg-blue-500/10">
                <FlaskConical className="h-5 w-5 text-blue-500 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-metric-total">
                  {total}
                </p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-metric-active">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-md p-2.5 bg-sky-500/10">
                <Activity className="h-5 w-5 text-sky-500 dark:text-sky-400" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-metric-active">
                  {active}
                </p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-metric-passing">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-md p-2.5 bg-emerald-500/10">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-metric-passing">
                  {passing}
                </p>
                <p className="text-xs text-muted-foreground">Passing</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-metric-failing">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-md p-2.5 bg-red-500/10">
                <XCircle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-metric-failing">
                  {failing}
                </p>
                <p className="text-xs text-muted-foreground">Failing</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-metric-pending">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-md p-2.5 bg-yellow-500/10">
                <Pause className="h-5 w-5 text-yellow-500 dark:text-yellow-400" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-metric-pending">
                  {pending}
                </p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create Test Suite Form */}
      <section>
        <h3 className="text-lg font-semibold tracking-tight mb-3">Create Test Suite</h3>
        <Card>
          <CardContent className="p-5">
            <TestForm form={form} setForm={setForm} disabled={createMutation.isPending} />
            <div className="flex items-center justify-end gap-2 mt-4">
              <Button
                onClick={() => createMutation.mutate(form)}
                disabled={!formValid || createMutation.isPending}
                data-testid="button-dashboard-create"
              >
                {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Create Test
              </Button>
            </div>
            {createMutation.isError && (
              <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                {createMutation.error.message}
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Recent Test Runs */}
      <section>
        <h3 className="text-lg font-semibold tracking-tight mb-3">Recent Test Runs</h3>
        {recentRuns.length > 0 ? (
          <div className="space-y-2">
            {recentRuns.map((r) => (
              <Link key={r.test_id} href={`/tests/${r.test_id}`}>
                <Card
                  className="hover-elevate cursor-pointer"
                  data-testid={`card-recent-${r.test_id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3 min-w-0">
                        {r.last_result === "passed" ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        ) : r.last_result === "failed" ? (
                          <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                        ) : (
                          <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{r.test_name}</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-xs text-muted-foreground truncate">{r.test_url}</p>
                            {r.steps_total != null && (
                              <span className="text-xs text-muted-foreground" data-testid={`text-steps-${r.test_id}`}>
                                {r.steps_passed}/{r.steps_total} steps
                              </span>
                            )}
                            {r.duration_ms != null && (
                              <span className="text-xs text-muted-foreground" data-testid={`text-duration-${r.test_id}`}>
                                {(r.duration_ms / 1000).toFixed(1)}s
                              </span>
                            )}
                            {r.triggered_by && (
                              <span className="text-xs text-muted-foreground capitalize" data-testid={`text-source-${r.test_id}`}>
                                {r.triggered_by}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {r.last_run_at && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatDistanceToNow(new Date(r.last_run_at), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-8">
              <div className="flex flex-col items-center justify-center text-center space-y-4">
                <div className="rounded-md bg-muted p-3">
                  <LayoutDashboard className="h-8 w-8 text-muted-foreground" />
                </div>
                <div className="space-y-1.5">
                  <p className="font-semibold" data-testid="text-empty-state">
                    No test runs yet
                  </p>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Create a test suite above or run a quick test to see results here.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant="outline" asChild data-testid="link-tests">
                    <Link href="/tests">
                      <FlaskConical className="h-4 w-4" />
                      View Tests
                    </Link>
                  </Button>
                  <Button asChild data-testid="link-run-test">
                    <Link href="/run">
                      <Play className="h-4 w-4" />
                      Run a Quick Test
                    </Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
