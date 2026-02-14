import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Database,
  MessageSquare,
  Globe,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Zap,
  BrainCircuit,
  Play,
  Loader2,
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

export default function SettingsPage() {
  const healthQuery = useQuery<HealthCheck>({
    queryKey: ["/api/health"],
    refetchInterval: 30000,
  });

  const health = healthQuery.data;

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Service Health</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Connection status for all external dependencies
            </p>
          </div>
          <div className="flex items-center gap-2">
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
          </div>
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
          <h2 className="text-xl font-bold tracking-tight">Sanity Checks</h2>
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
    </div>
  );
}
