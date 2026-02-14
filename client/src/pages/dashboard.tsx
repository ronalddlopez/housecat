import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  CheckCircle2,
  XCircle,
  FlaskConical,
  Play,
  Clock,
} from "lucide-react";
import { Link } from "wouter";

interface TestSuite {
  id: string;
  name: string;
  url: string;
  status: string;
  last_result: string;
  last_run_at?: string;
}

export default function Dashboard() {
  const { data } = useQuery<{ tests: TestSuite[]; total: number }>({
    queryKey: ["/api/tests"],
    refetchInterval: 30000,
  });

  const tests = data?.tests || [];
  const total = tests.length;
  const passing = tests.filter((t) => t.last_result === "passed").length;
  const failing = tests.filter((t) => t.last_result === "failed").length;

  const recentTests = tests
    .filter((t) => t.last_run_at && t.last_run_at.length > 0)
    .sort((a, b) => (b.last_run_at || "").localeCompare(a.last_run_at || ""))
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Overview of your test runs and system status
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                <p className="text-xs text-muted-foreground">Total Tests</p>
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
      </div>

      <section>
        <h3 className="text-lg font-semibold tracking-tight mb-3">Recent Test Runs</h3>
        {recentTests.length > 0 ? (
          <div className="space-y-2">
            {recentTests.map((t) => (
              <Card key={t.id} data-testid={`card-recent-${t.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      {t.last_result === "passed" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      ) : t.last_result === "failed" ? (
                        <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                      ) : (
                        <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{t.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{t.url}</p>
                      </div>
                    </div>
                    {t.last_run_at && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {new Date(t.last_run_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
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
                    Create a test suite or run a quick test to see results here.
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
