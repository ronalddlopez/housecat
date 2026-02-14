import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Database,
  MessageSquare,
  Bot,
  Globe,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Cat,
  Zap,
  BrainCircuit,
  Play,
  Loader2,
  FlaskConical,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { HealthCheck, TinyfishResult, AgentResult } from "@shared/schema";

function StatusIcon({ status }: { status: string }) {
  if (status === "connected" || status === "key_set") {
    return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
  }
  if (status.startsWith("error") || status === "missing") {
    return <XCircle className="h-5 w-5 text-red-500" />;
  }
  return <AlertTriangle className="h-5 w-5 text-amber-500" />;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "connected" || status === "key_set") {
    return (
      <Badge variant="default" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 no-default-hover-elevate no-default-active-elevate" data-testid="badge-status-ok">
        {status === "connected" ? "Connected" : "Key Set"}
      </Badge>
    );
  }
  if (status.startsWith("error") || status === "missing") {
    return (
      <Badge variant="default" className="bg-red-500/15 text-red-700 dark:text-red-400 no-default-hover-elevate no-default-active-elevate" data-testid="badge-status-error">
        {status === "missing" ? "Missing" : "Error"}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" data-testid="badge-status-unknown">
      Unknown
    </Badge>
  );
}

const serviceConfig = [
  {
    key: "redis" as const,
    name: "Upstash Redis",
    description: "In-memory data store for test configs & results",
    icon: Database,
    color: "text-red-500 dark:text-red-400",
    bgColor: "bg-red-500/10",
  },
  {
    key: "qstash" as const,
    name: "QStash",
    description: "Message queue for scheduled test triggers",
    icon: MessageSquare,
    color: "text-emerald-500 dark:text-emerald-400",
    bgColor: "bg-emerald-500/10",
  },
  {
    key: "tinyfish" as const,
    name: "TinyFish",
    description: "Browser automation for UI testing",
    icon: Globe,
    color: "text-blue-500 dark:text-blue-400",
    bgColor: "bg-blue-500/10",
  },
  {
    key: "anthropic" as const,
    name: "Anthropic Claude",
    description: "AI agent for intelligent test analysis",
    icon: BrainCircuit,
    color: "text-violet-500 dark:text-violet-400",
    bgColor: "bg-violet-500/10",
  },
];

function ServiceCard({
  service,
  status,
  isLoading,
}: {
  service: (typeof serviceConfig)[number];
  status: string | undefined;
  isLoading: boolean;
}) {
  const Icon = service.icon;

  return (
    <Card className="hover-elevate transition-all duration-200" data-testid={`card-service-${service.key}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`rounded-md p-2.5 ${service.bgColor}`}>
              <Icon className={`h-5 w-5 ${service.color}`} />
            </div>
            <div>
              <p className="font-semibold text-sm" data-testid={`text-service-name-${service.key}`}>
                {service.name}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {service.description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isLoading ? (
              <Skeleton className="h-5 w-16 rounded-full" />
            ) : status ? (
              <>
                <StatusIcon status={status} />
                <StatusBadge status={status} />
              </>
            ) : null}
          </div>
        </div>
        {status && status.startsWith("error:") && (
          <p className="text-xs text-red-600 dark:text-red-400 mt-3 font-mono bg-red-500/5 p-2 rounded-md" data-testid={`text-error-${service.key}`}>
            {status.replace("error: ", "")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function SanityCheckCard({
  title,
  description,
  icon: Icon,
  iconColor,
  iconBg,
  mutationFn,
  resultRenderer,
  testId,
}: {
  title: string;
  description: string;
  icon: typeof Zap;
  iconColor: string;
  iconBg: string;
  mutationFn: () => Promise<Response>;
  resultRenderer: (data: any) => React.ReactNode;
  testId: string;
}) {
  const mutation = useMutation({
    mutationFn: async () => {
      const res = await mutationFn();
      return res.json();
    },
  });

  return (
    <Card data-testid={`card-${testId}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`rounded-md p-2.5 ${iconBg}`}>
              <Icon className={`h-5 w-5 ${iconColor}`} />
            </div>
            <div>
              <p className="font-semibold text-sm">{title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {description}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            data-testid={`button-run-${testId}`}
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {mutation.isPending ? "Running..." : "Run"}
          </Button>
        </div>

        {mutation.isSuccess && (
          <div className="mt-4 p-3 bg-muted/50 rounded-md" data-testid={`result-${testId}`}>
            {resultRenderer(mutation.data)}
          </div>
        )}

        {mutation.isError && (
          <div className="mt-4 p-3 bg-red-500/5 rounded-md" data-testid={`error-${testId}`}>
            <p className="text-xs text-red-600 dark:text-red-400 font-mono">
              {mutation.error.message}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RunTestSection() {
  const [url, setUrl] = useState("");
  const [goal, setGoal] = useState("");
  const [showPlan, setShowPlan] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/tests/manual/run", { url, goal });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return res.json();
    },
  });

  const result = mutation.data;
  const canSubmit = url.trim().length > 0 && goal.trim().length > 0 && !mutation.isPending;

  return (
    <section>
      <div className="mb-1">
        <h2 className="text-xl font-bold tracking-tight">Run Test</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Run the AI-powered Planner &rarr; Browser &rarr; Evaluator pipeline against any URL
        </p>
      </div>

      <Card className="mt-5">
        <CardContent className="p-5 space-y-4">
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block" htmlFor="test-url">
                URL
              </label>
              <Input
                id="test-url"
                type="url"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={mutation.isPending}
                data-testid="input-test-url"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block" htmlFor="test-goal">
                Goal
              </label>
              <Textarea
                id="test-goal"
                placeholder="Describe what to test in plain English, e.g. 'Verify the page loads and has a heading that says Example Domain'"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                disabled={mutation.isPending}
                rows={3}
                className="resize-none"
                data-testid="input-test-goal"
              />
            </div>
          </div>

          <Button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit}
            data-testid="button-run-test"
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FlaskConical className="h-4 w-4" />
            )}
            {mutation.isPending ? "Running Test..." : "Run Test"}
          </Button>

          {mutation.isPending && (
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-md" data-testid="status-running">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Test in progress</p>
                <p className="text-xs text-muted-foreground">
                  This takes 15-60 seconds while TinyFish runs a real browser...
                </p>
              </div>
            </div>
          )}

          {mutation.isError && (
            <div className="p-3 bg-red-500/5 rounded-md" data-testid="error-test-result">
              <p className="text-sm text-red-600 dark:text-red-400 font-mono">
                {mutation.error.message}
              </p>
            </div>
          )}

          {mutation.isSuccess && result && (
            <div className="space-y-4" data-testid="section-test-results">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  {result.result?.passed ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                  <Badge
                    variant="default"
                    className={`${
                      result.result?.passed
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                        : "bg-red-500/15 text-red-700 dark:text-red-400"
                    } no-default-hover-elevate no-default-active-elevate`}
                    data-testid="badge-test-verdict"
                  >
                    {result.result?.passed ? "PASSED" : "FAILED"}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {result.result?.duration_ms != null && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      <span data-testid="text-duration">
                        {(result.result.duration_ms / 1000).toFixed(1)}s
                      </span>
                    </div>
                  )}
                  {result.browser_result?.streaming_url && (
                    <a
                      href={result.browser_result.streaming_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      data-testid="link-browser-preview"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Browser Preview
                    </a>
                  )}
                </div>
              </div>

              {result.result?.details && (
                <div className="p-3 bg-muted/50 rounded-md">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Evaluator Assessment</p>
                  <p className="text-sm" data-testid="text-details">
                    {result.result.details}
                  </p>
                </div>
              )}

              {result.result?.error && (
                <div className="p-3 bg-red-500/5 rounded-md">
                  <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">Error</p>
                  <p className="text-sm text-red-600 dark:text-red-400 font-mono" data-testid="text-error">
                    {result.result.error}
                  </p>
                </div>
              )}

              {result.result?.step_results && result.result.step_results.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Step Results</p>
                  <div className="space-y-2">
                    {result.result.step_results.map((step: any, i: number) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 p-2.5 bg-muted/30 rounded-md"
                        data-testid={`step-result-${i}`}
                      >
                        {step.passed ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            Step {step.step_number || i + 1}
                          </p>
                          {step.details && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {step.details}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.plan?.steps && result.plan.steps.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowPlan(!showPlan)}
                    className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
                    data-testid="button-toggle-plan"
                  >
                    {showPlan ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                    {showPlan ? "Hide" : "Show"} Plan ({result.plan.steps.length} steps)
                  </button>
                  {showPlan && (
                    <div className="mt-2 space-y-1.5">
                      {result.plan.steps.map((step: any, i: number) => (
                        <div
                          key={i}
                          className="text-xs font-mono text-muted-foreground p-2 bg-muted/30 rounded-md"
                          data-testid={`plan-step-${i}`}
                        >
                          <span className="font-semibold">Step {step.step_number || i + 1}:</span>{" "}
                          {step.description}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

export default function Dashboard() {
  const healthQuery = useQuery<HealthCheck>({
    queryKey: ["/api/health"],
    refetchInterval: 30000,
  });

  const health = healthQuery.data;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="rounded-md bg-primary/10 p-1.5">
              <Cat className="h-5 w-5 text-primary" />
            </div>
            <h1 className="font-bold text-lg tracking-tight">HouseCat</h1>
            <Badge variant="secondary" className="text-[10px] font-mono no-default-hover-elevate no-default-active-elevate">
              v0.1.0
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: ["/api/health"] })
              }
              disabled={healthQuery.isFetching}
              data-testid="button-refresh-health"
            >
              <RefreshCw
                className={`h-4 w-4 ${healthQuery.isFetching ? "animate-spin" : ""}`}
              />
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <section>
          <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
            <div>
              <h2 className="text-xl font-bold tracking-tight">
                System Health
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Service connection status for all external dependencies
              </p>
            </div>
            {health && (
              <Badge
                variant="default"
                className={`${
                  health.overallStatus === "all_green"
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                } no-default-hover-elevate no-default-active-elevate`}
                data-testid="badge-overall-status"
              >
                {health.overallStatus === "all_green"
                  ? "All Systems Green"
                  : "Issues Detected"}
              </Badge>
            )}
          </div>

          <div className="grid gap-3 mt-5">
            {serviceConfig.map((service) => (
              <ServiceCard
                key={service.key}
                service={service}
                status={health?.[service.key]}
                isLoading={healthQuery.isLoading}
              />
            ))}
          </div>

          {health?.publicUrl && (
            <Card className="mt-3">
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-md p-2.5 bg-primary/10">
                    <Globe className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Public URL</p>
                    <p
                      className="text-xs text-muted-foreground font-mono mt-0.5"
                      data-testid="text-public-url"
                    >
                      {health.publicUrl}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </section>

        <section>
          <div className="mb-1">
            <h2 className="text-xl font-bold tracking-tight">
              Sanity Checks
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Run live tests to verify each service is working end-to-end
            </p>
          </div>

          <div className="grid gap-3 mt-5">
            <SanityCheckCard
              title="TinyFish Browser Automation"
              description="Navigates to example.com and extracts the page heading"
              icon={Zap}
              iconColor="text-blue-500 dark:text-blue-400"
              iconBg="bg-blue-500/10"
              mutationFn={() => apiRequest("POST", "/api/test/tinyfish")}
              testId="tinyfish-test"
              resultRenderer={(data: TinyfishResult) => (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {data.success ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span className="text-sm font-medium">
                      {data.success ? "Success" : "Failed"}
                    </span>
                  </div>
                  {data.result && (
                    <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                      {typeof data.result === "string"
                        ? data.result
                        : JSON.stringify(data.result, null, 2)}
                    </pre>
                  )}
                  {data.streamingUrl && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium">Stream:</span>{" "}
                      <span className="font-mono">{data.streamingUrl}</span>
                    </p>
                  )}
                  {data.error && (
                    <p className="text-xs text-red-600 dark:text-red-400 font-mono">
                      {data.error}
                    </p>
                  )}
                </div>
              )}
            />

            <SanityCheckCard
              title="Claude AI Agent"
              description="Asks Claude Haiku a simple question to verify the integration"
              icon={BrainCircuit}
              iconColor="text-violet-500 dark:text-violet-400"
              iconBg="bg-violet-500/10"
              mutationFn={() => apiRequest("POST", "/api/test/agent")}
              testId="agent-test"
              resultRenderer={(data: AgentResult) => (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {data.success ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span className="text-sm font-medium">
                      {data.success ? "Success" : "Failed"}
                    </span>
                  </div>
                  {data.output && (
                    <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                      {typeof data.output === "string"
                        ? data.output
                        : JSON.stringify(data.output, null, 2)}
                    </pre>
                  )}
                  {data.error && (
                    <p className="text-xs text-red-600 dark:text-red-400 font-mono">
                      {data.error}
                    </p>
                  )}
                </div>
              )}
            />

            <SanityCheckCard
              title="QStash Message Delivery"
              description="Sends a one-shot message to verify QStash can reach this server"
              icon={MessageSquare}
              iconColor="text-emerald-500 dark:text-emerald-400"
              iconBg="bg-emerald-500/10"
              mutationFn={() => apiRequest("POST", "/api/test/qstash")}
              testId="qstash-test"
              resultRenderer={(data: any) => (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {data.success ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span className="text-sm font-medium">
                      {data.success ? "Message Sent" : "Failed"}
                    </span>
                  </div>
                  {data.messageId && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium">Message ID:</span>{" "}
                      <span className="font-mono">{data.messageId}</span>
                    </p>
                  )}
                  {data.error && (
                    <p className="text-xs text-red-600 dark:text-red-400 font-mono">
                      {data.error}
                    </p>
                  )}
                </div>
              )}
            />
          </div>
        </section>

        <RunTestSection />

        <footer className="text-center pb-8 pt-4">
          <p className="text-xs text-muted-foreground">
            HouseCat v0.1.0
          </p>
        </footer>
      </main>
    </div>
  );
}
