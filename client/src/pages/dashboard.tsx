import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  FlaskConical,
} from "lucide-react";
import { Link } from "wouter";

export default function Dashboard() {
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
                <p className="text-2xl font-bold" data-testid="text-metric-total">0</p>
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
                <p className="text-2xl font-bold" data-testid="text-metric-passing">0</p>
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
                <p className="text-2xl font-bold" data-testid="text-metric-failing">0</p>
                <p className="text-xs text-muted-foreground">Failing</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <section>
        <h3 className="text-lg font-semibold tracking-tight mb-3">Recent Test Runs</h3>
        <Card>
          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center text-center space-y-4">
              <div className="rounded-md bg-muted p-3">
                <LayoutDashboard className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="space-y-1.5">
                <p className="font-semibold" data-testid="text-empty-state">
                  No tests yet
                </p>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Create your first test suite or run a quick test to see results here.
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
      </section>
    </div>
  );
}
