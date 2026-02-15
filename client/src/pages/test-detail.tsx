import { useState, Fragment } from "react";
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
  ChevronDown,
  Copy,
  ExternalLink,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { LiveExecutionPanel } from "@/components/live-execution-panel";
import { useToast } from "@/hooks/use-toast";

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

interface StepResult {
  step_number: number;
  passed: boolean;
  details: string;
  retry_count: number;
}

interface PlanStep {
  step_number: number;
  description: string;
  success_criteria: string;
}

interface Plan {
  tinyfish_goal: string;
  steps: PlanStep[];
  total_steps: number;
}

interface Screenshot {
  step_number: number;
  label?: string;
  url: string;
  image_base64: string;
  captured_at: string;
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
  step_results?: StepResult[];
  plan?: Plan;
  tinyfish_raw?: string;
  tinyfish_data?: any;
  streaming_url?: string;
  screenshots?: Screenshot[];
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

function RunDetailPanel({ run }: { run: RunResult }) {
  const { toast } = useToast();

  return (
    <div className="p-4 border-t" data-testid={`panel-run-detail-${run.run_id}`}>
      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary" data-testid="tab-summary">Summary</TabsTrigger>
          <TabsTrigger value="screenshots" data-testid="tab-screenshots">Screenshots</TabsTrigger>
          <TabsTrigger value="evidence" data-testid="tab-evidence">Evidence</TabsTrigger>
          <TabsTrigger value="raw-json" data-testid="tab-raw-json">Raw JSON</TabsTrigger>
          <TabsTrigger value="plan" data-testid="tab-plan">Plan</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-4 space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Evaluator Assessment</p>
            <p className="text-sm text-muted-foreground">{run.details || "No assessment available."}</p>
          </div>
          {run.error && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-red-600 dark:text-red-400">Error</p>
              <p className="text-sm text-muted-foreground">{run.error}</p>
            </div>
          )}
          {run.step_results && run.step_results.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Step Breakdown</p>
              <div className="space-y-1.5">
                {run.step_results.map((sr) => {
                  const planStep = run.plan?.steps?.find((ps) => ps.step_number === sr.step_number);
                  return (
                    <div key={sr.step_number} className="flex items-start gap-2 text-sm">
                      {sr.passed ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <span className="font-medium">Step {sr.step_number}</span>
                        {planStep && (
                          <span className="text-muted-foreground"> — {planStep.description}</span>
                        )}
                        <p className="text-muted-foreground">{sr.details}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No step data available.</p>
          )}
          {run.streaming_url && (
            <Button variant="outline" asChild data-testid="button-view-tinyfish">
              <a href={run.streaming_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
                View in TinyFish
              </a>
            </Button>
          )}
        </TabsContent>

        <TabsContent value="screenshots" className="mt-4">
          {run.screenshots && run.screenshots.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {run.screenshots.map((ss, idx) => (
                <div key={idx} className="space-y-1.5">
                  <img
                    src={`data:image/jpeg;base64,${ss.image_base64}`}
                    alt={ss.label || `Step ${ss.step_number} screenshot`}
                    className="rounded-md w-full"
                    data-testid={`img-screenshot-${ss.step_number}`}
                  />
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-medium">
                      {ss.label || `Step ${ss.step_number}`}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(ss.captured_at), "MMM d, HH:mm:ss")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No screenshots captured for this run.</p>
          )}
        </TabsContent>

        <TabsContent value="evidence" className="mt-4">
          {run.tinyfish_data ? (() => {
            const v = run.tinyfish_data.verification || run.tinyfish_data;
            const checks = v?.checks;
            return (
              <div className="space-y-3">
                <Table>
                  <TableBody>
                    {(v?.goal || run.tinyfish_data.goal) && (
                      <TableRow>
                        <TableCell className="font-medium text-sm">Goal</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{v?.goal || run.tinyfish_data.goal}</TableCell>
                      </TableRow>
                    )}
                    {(v?.status || run.tinyfish_data.status) && (
                      <TableRow>
                        <TableCell className="font-medium text-sm">Status</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{v?.status || run.tinyfish_data.status}</TableCell>
                      </TableRow>
                    )}
                    {(v?.message || run.tinyfish_data.message) && (
                      <TableRow>
                        <TableCell className="font-medium text-sm">Message</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{v?.message || run.tinyfish_data.message}</TableCell>
                      </TableRow>
                    )}
                    {checks && typeof checks === "object" && !Array.isArray(checks) && Object.entries(checks).map(([key, value]) => (
                      <TableRow key={key}>
                        <TableCell className="font-medium text-sm font-mono">{key}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{String(value)}</TableCell>
                      </TableRow>
                    ))}
                    {checks && Array.isArray(checks) && checks.map((check: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium text-sm">{check.name || `Check ${idx + 1}`}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{check.result || check.status || JSON.stringify(check)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            );
          })() : (
            <p className="text-sm text-muted-foreground">No verification data available.</p>
          )}
        </TabsContent>

        <TabsContent value="raw-json" className="mt-4">
          {run.tinyfish_raw ? (
            <div className="relative">
              <Button
                variant="outline"
                size="icon"
                className="absolute top-2 right-2"
                data-testid="button-copy-json"
                onClick={() => {
                  navigator.clipboard.writeText(run.tinyfish_raw!);
                  toast({ title: "Copied to clipboard" });
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <pre className="p-4 rounded-md text-xs overflow-auto max-h-96 bg-zinc-900 text-zinc-100 dark:bg-zinc-950">
                {run.tinyfish_raw}
              </pre>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No raw data available.</p>
          )}
        </TabsContent>

        <TabsContent value="plan" className="mt-4">
          {run.plan ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Goal</p>
                <pre className="p-3 rounded-md text-xs bg-zinc-900 text-zinc-100 dark:bg-zinc-950">
                  {run.plan.tinyfish_goal}
                </pre>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Steps ({run.plan.total_steps})</p>
                <div className="space-y-2">
                  {run.plan.steps.map((step) => (
                    <div key={step.step_number} className="flex items-start gap-2 text-sm">
                      <Badge variant="secondary" className="shrink-0 no-default-hover-elevate no-default-active-elevate">
                        {step.step_number}
                      </Badge>
                      <div>
                        <p className="font-medium">{step.description}</p>
                        <p className="text-muted-foreground text-xs">{step.success_criteria}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No plan data available.</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
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
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

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
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r) => (
                    <Fragment key={r.run_id}>
                      <TableRow
                        data-testid={`row-result-${r.run_id}`}
                        className="cursor-pointer hover-elevate"
                        onClick={() => setExpandedRunId(expandedRunId === r.run_id ? null : r.run_id)}
                      >
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
                        <TableCell className="text-center">
                          <ChevronDown
                            className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${expandedRunId === r.run_id ? "rotate-180" : ""}`}
                          />
                        </TableCell>
                      </TableRow>
                      {expandedRunId === r.run_id && (
                        <TableRow key={`${r.run_id}-detail`}>
                          <TableCell colSpan={7} className="p-0">
                            <RunDetailPanel run={r} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
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
