import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useRoute, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  ArrowLeft,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Pause,
  Activity,
  Timer,
  TrendingUp,
  AlertTriangle,
  Bell,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { LiveExecutionPanel } from "@/components/live-execution-panel";

interface TestSuite {
  id: string;
  name: string;
  url: string;
  goal: string;
  schedule: string;
  status: string;
  last_result: string;
  last_run_at?: string;
}

interface RunResult {
  run_id: string;
  test_id: string;
  passed: boolean;
  duration_ms: number;
  steps_passed: number;
  steps_total: number;
  details: string;
  error: string | null;
  triggered_by: string;
  started_at: string;
  completed_at: string;
}

interface TimingPoint {
  timestamp: string;
  duration_ms: number;
}

interface UptimeData {
  test_id: string;
  uptime_pct: number;
  total_runs: number;
  passed_runs: number;
  failed_runs: number;
  window_hours: number;
}

interface Incident {
  run_id: string;
  test_id: string;
  error: string;
  details: string;
  started_at: string;
  alert_sent: boolean;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "active") {
    return (
      <Badge
        variant="default"
        className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 no-default-hover-elevate no-default-active-elevate"
        data-testid="badge-status"
      >
        Active
      </Badge>
    );
  }
  if (status === "paused") {
    return (
      <Badge
        variant="default"
        className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 no-default-hover-elevate no-default-active-elevate"
        data-testid="badge-status"
      >
        Paused
      </Badge>
    );
  }
  return (
    <Badge
      variant="default"
      className="bg-red-500/15 text-red-700 dark:text-red-400 no-default-hover-elevate no-default-active-elevate"
      data-testid="badge-status"
    >
      Error
    </Badge>
  );
}

function ResultBadge({ result }: { result: string }) {
  if (result === "passed") {
    return (
      <Badge
        variant="default"
        className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 no-default-hover-elevate no-default-active-elevate"
      >
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Passed
      </Badge>
    );
  }
  if (result === "failed") {
    return (
      <Badge
        variant="default"
        className="bg-red-500/10 text-red-700 dark:text-red-400 no-default-hover-elevate no-default-active-elevate"
      >
        <XCircle className="h-3 w-3 mr-1" />
        Failed
      </Badge>
    );
  }
  return (
    <Badge
      variant="secondary"
      className="no-default-hover-elevate no-default-active-elevate"
    >
      <Clock className="h-3 w-3 mr-1" />
      Pending
    </Badge>
  );
}

const chartConfig = {
  duration: {
    label: "Response Time",
    color: "hsl(var(--primary))",
  },
};

export default function TestDetailPage() {
  const [, params] = useRoute("/tests/:id");
  const id = params?.id;
  const [runTrigger, setRunTrigger] = useState(0);

  const { data: test, isLoading: testLoading } = useQuery<TestSuite>({
    queryKey: ["/api/tests", id],
    enabled: !!id,
  });

  const { data: resultsData } = useQuery<{ results: RunResult[]; total: number }>({
    queryKey: ["/api/tests", id, "results"],
    enabled: !!id,
  });

  const { data: timingData } = useQuery<{ timing: TimingPoint[]; total: number }>({
    queryKey: ["/api/tests", id, "timing"],
    enabled: !!id,
  });

  const { data: uptimeData } = useQuery<UptimeData>({
    queryKey: ["/api/tests", id, "uptime"],
    enabled: !!id,
  });

  const { data: incidentsData } = useQuery<{ incidents: Incident[]; total: number }>({
    queryKey: ["/api/tests", id, "incidents"],
    enabled: !!id,
  });

  const runMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/tests/${id}/run`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tests", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/tests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tests", id, "results"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tests", id, "timing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tests", id, "uptime"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tests", id, "incidents"] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (status: string) =>
      apiRequest("PUT", `/api/tests/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tests", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/tests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
  });

  if (testLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!test) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" asChild>
          <Link href="/tests">
            <ArrowLeft className="h-4 w-4" />
            Back to Tests
          </Link>
        </Button>
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">Test not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const results = resultsData?.results || [];
  const timing = timingData?.timing || [];
  const incidents = incidentsData?.incidents || [];

  const chartData = [...timing]
    .reverse()
    .map((t) => ({
      time: format(new Date(t.timestamp), "HH:mm"),
      seconds: Math.round(t.duration_ms / 100) / 10,
      duration_ms: t.duration_ms,
    }));

  const avgDuration =
    timing.length > 0
      ? Math.round(timing.reduce((s, t) => s + t.duration_ms, 0) / timing.length / 100) / 10
      : 0;

  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild data-testid="link-back-tests">
        <Link href="/tests">
          <ArrowLeft className="h-4 w-4" />
          Back to Tests
        </Link>
      </Button>

      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-xl font-bold tracking-tight" data-testid="text-test-name">
            {test.name}
          </h2>
          <StatusBadge status={test.status} />
          <ResultBadge result={test.last_result} />
        </div>
        <p className="text-sm text-muted-foreground" data-testid="text-test-url">
          {test.url}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={() => {
              setRunTrigger((t) => t + 1);
              runMutation.mutate();
            }}
            disabled={runMutation.isPending}
            data-testid="button-run-now"
          >
            {runMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {runMutation.isPending ? "Running..." : "Run Now"}
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              toggleMutation.mutate(test.status === "active" ? "paused" : "active")
            }
            disabled={toggleMutation.isPending}
            data-testid="button-toggle-status"
          >
            {test.status === "active" ? (
              <>
                <Pause className="h-4 w-4" />
                Pause
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Resume
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card data-testid="card-uptime">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-md p-2.5 bg-emerald-500/10">
                <Activity className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-uptime">
                  {uptimeData ? `${uptimeData.uptime_pct}%` : "--"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Uptime ({uptimeData?.window_hours || 24}h)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-last-result">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-md p-2.5 bg-blue-500/10">
                <TrendingUp className="h-5 w-5 text-blue-500 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold capitalize" data-testid="text-last-result">
                  {test.last_result || "Pending"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {test.last_run_at
                    ? formatDistanceToNow(new Date(test.last_run_at), { addSuffix: true })
                    : "Never run"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-avg-time">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-md p-2.5 bg-purple-500/10">
                <Timer className="h-5 w-5 text-purple-500 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-avg-time">
                  {avgDuration > 0 ? `${avgDuration}s` : "--"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Avg Response ({timing.length} runs)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <LiveExecutionPanel
        testId={id!}
        runTrigger={runTrigger}
        onComplete={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/tests", id] });
          queryClient.invalidateQueries({ queryKey: ["/api/tests"] });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
          queryClient.invalidateQueries({ queryKey: ["/api/tests", id, "results"] });
          queryClient.invalidateQueries({ queryKey: ["/api/tests", id, "timing"] });
          queryClient.invalidateQueries({ queryKey: ["/api/tests", id, "uptime"] });
          queryClient.invalidateQueries({ queryKey: ["/api/tests", id, "incidents"] });
        }}
      />

      {chartData.length > 1 && (
        <Card data-testid="card-chart">
          <CardContent className="p-5">
            <p className="text-sm font-medium mb-4">Response Time</p>
            <ChartContainer config={chartConfig} className="h-52 w-full">
              <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="fillDuration" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-duration)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-duration)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="time"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  className="fill-muted-foreground"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  className="fill-muted-foreground"
                  tickFormatter={(v) => `${v}s`}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => [`${value}s`, "Duration"]}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="seconds"
                  stroke="var(--color-duration)"
                  fill="url(#fillDuration)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="history" data-testid="tabs-detail">
        <TabsList>
          <TabsTrigger value="history" data-testid="tab-history">
            History
            {resultsData && (
              <Badge variant="secondary" className="ml-1.5 no-default-hover-elevate no-default-active-elevate">
                {resultsData.total}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="incidents" data-testid="tab-incidents">
            Incidents
            {incidentsData && incidentsData.total > 0 && (
              <Badge variant="secondary" className="ml-1.5 no-default-hover-elevate no-default-active-elevate">
                {incidentsData.total}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="mt-4">
          {results.length > 0 ? (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Run ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Steps</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r) => (
                    <TableRow key={r.run_id} data-testid={`row-result-${r.run_id}`}>
                      <TableCell className="font-mono text-xs" data-testid={`text-run-id-${r.run_id}`}>
                        {r.run_id}
                      </TableCell>
                      <TableCell>
                        <ResultBadge result={r.passed ? "passed" : "failed"} />
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.steps_passed}/{r.steps_total}
                      </TableCell>
                      <TableCell className="text-sm">
                        {(r.duration_ms / 1000).toFixed(1)}s
                      </TableCell>
                      <TableCell className="text-sm capitalize text-muted-foreground">
                        {r.triggered_by}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(r.started_at), { addSuffix: true })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground text-sm" data-testid="text-no-results">
                  No run history yet. Click "Run Now" to trigger a test.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="incidents" className="mt-4">
          {incidents.length > 0 ? (
            <div className="space-y-2">
              {incidents.map((inc, idx) => (
                <Card key={`${inc.run_id}-${idx}`} data-testid={`card-incident-${inc.run_id}`}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                        <span className="text-sm font-medium">Run {inc.run_id}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {inc.alert_sent && (
                          <Badge
                            variant="secondary"
                            className="no-default-hover-elevate no-default-active-elevate"
                          >
                            <Bell className="h-3 w-3 mr-1" />
                            Alert Sent
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(inc.started_at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">{inc.error || inc.details}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground text-sm" data-testid="text-no-incidents">
                  No incidents recorded. Your test is running clean.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
