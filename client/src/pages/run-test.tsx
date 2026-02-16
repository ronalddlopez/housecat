import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2,
  XCircle,
  FlaskConical,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";

export default function RunTestPage() {
  const [url, setUrl] = useState("");
  const [goal, setGoal] = useState("");
  const [showPlan, setShowPlan] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/run-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, goal }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      return data;
    },
  });

  const result = mutation.data;
  const canSubmit = url.trim().length > 0 && goal.trim().length > 0 && !mutation.isPending;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Run Test</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Run the AI-powered Planner &rarr; Browser &rarr; Evaluator pipeline against any URL
        </p>
      </div>

      <Card>
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
    </div>
  );
}
