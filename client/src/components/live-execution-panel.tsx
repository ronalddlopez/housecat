import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Circle,
  ExternalLink,
  Sparkles,
  Globe,
  Brain,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

type Phase = "idle" | "planning" | "browsing" | "evaluating" | "complete" | "error";

interface PlannedStep {
  step_number: number;
  description: string;
}

interface StepStatus {
  step_number: number;
  description: string;
  state: "pending" | "running" | "passed" | "failed";
}

interface EventEntry {
  type: string;
  message: string;
  timestamp: string;
  [key: string]: string;
}

interface LiveExecutionPanelProps {
  testId: string;
  runTrigger: number;
  onComplete?: () => void;
}

const phaseOrder: Phase[] = ["planning", "browsing", "evaluating", "complete"];

function PhaseIndicator({ current }: { current: Phase }) {
  const phases = [
    { key: "planning", label: "Planning", icon: Sparkles },
    { key: "browsing", label: "Browsing", icon: Globe },
    { key: "evaluating", label: "Evaluating", icon: Brain },
  ] as const;

  const currentIdx = phaseOrder.indexOf(current);
  const isError = current === "error";

  return (
    <div className="flex items-center gap-1" data-testid="phase-indicator">
      {phases.map((p, i) => {
        const phaseIdx = phaseOrder.indexOf(p.key as Phase);
        let state: "done" | "active" | "pending" | "error" = "pending";
        if (isError) {
          state = phaseIdx < currentIdx ? "done" : phaseIdx === currentIdx ? "error" : "pending";
        } else if (current === "complete") {
          state = "done";
        } else if (phaseIdx < currentIdx) {
          state = "done";
        } else if (phaseIdx === currentIdx) {
          state = "active";
        }

        const Icon = p.icon;

        return (
          <div key={p.key} className="flex items-center gap-1">
            {i > 0 && (
              <div
                className={`w-8 h-0.5 rounded-full mx-0.5 ${
                  state === "done" || (state === "active" && i <= currentIdx)
                    ? "bg-emerald-500"
                    : state === "error"
                      ? "bg-red-500"
                      : "bg-muted"
                }`}
              />
            )}
            <Badge
              variant={state === "done" ? "default" : "secondary"}
              className={`gap-1 no-default-hover-elevate no-default-active-elevate ${
                state === "done"
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : state === "active"
                    ? "bg-blue-500/15 text-blue-700 dark:text-blue-400"
                    : state === "error"
                      ? "bg-red-500/15 text-red-700 dark:text-red-400"
                      : ""
              }`}
              data-testid={`phase-${p.key}`}
            >
              {state === "done" ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : state === "active" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : state === "error" ? (
                <XCircle className="h-3 w-3" />
              ) : (
                <Icon className="h-3 w-3" />
              )}
              {p.label}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}

function StepTracker({ steps }: { steps: StepStatus[] }) {
  return (
    <div className="space-y-1.5" data-testid="step-tracker">
      {steps.map((s) => (
        <div
          key={s.step_number}
          className="flex items-start gap-2 text-sm"
          data-testid={`step-item-${s.step_number}`}
        >
          <div className="mt-0.5 shrink-0">
            {s.state === "passed" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : s.state === "failed" ? (
              <XCircle className="h-4 w-4 text-red-500" />
            ) : s.state === "running" ? (
              <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <span
            className={
              s.state === "pending" ? "text-muted-foreground" : ""
            }
          >
            Step {s.step_number}: {s.description}
          </span>
        </div>
      ))}
    </div>
  );
}

export function LiveExecutionPanel({ testId, runTrigger, onComplete }: LiveExecutionPanelProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [steps, setSteps] = useState<StepStatus[]>([]);
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [streamingUrl, setStreamingUrl] = useState<string | null>(null);
  const [finalResult, setFinalResult] = useState<boolean | null>(null);
  const [visible, setVisible] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevTriggerRef = useRef(runTrigger);

  useEffect(() => {
    if (runTrigger === 0 || runTrigger === prevTriggerRef.current) return;
    prevTriggerRef.current = runTrigger;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setPhase("idle");
    setSteps([]);
    setEvents([]);
    setStreamingUrl(null);
    setFinalResult(null);
    setVisible(true);

    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    const connectDelay = setTimeout(() => {
      const es = new EventSource(`/api/tests/${testId}/live`);
      eventSourceRef.current = es;

      es.onmessage = (evt) => {
        try {
          const data: EventEntry = JSON.parse(evt.data);
          setEvents((prev) => [...prev, data]);

          switch (data.type) {
            case "plan_start":
              setPhase("planning");
              break;
            case "plan_complete": {
              setPhase("browsing");
              if (data.steps) {
                try {
                  const parsed: PlannedStep[] = JSON.parse(data.steps);
                  setSteps(
                    parsed.map((s) => ({
                      step_number: s.step_number,
                      description: s.description,
                      state: "pending",
                    }))
                  );
                } catch {}
              }
              break;
            }
            case "browser_preview":
              if (data.streaming_url) setStreamingUrl(data.streaming_url);
              break;
            case "step_complete": {
              const stepNum = parseInt(data.step_number, 10);
              const passed = data.passed === "true" || data.passed === "True";
              setSteps((prev) =>
                prev.map((s) => {
                  if (s.step_number === stepNum) {
                    return { ...s, state: passed ? "passed" : "failed" };
                  }
                  if (s.step_number === stepNum + 1 && s.state === "pending") {
                    return { ...s, state: "running" };
                  }
                  return s;
                })
              );
              break;
            }
            case "browser_start":
              setSteps((prev) =>
                prev.length > 0 && prev[0].state === "pending"
                  ? [{ ...prev[0], state: "running" }, ...prev.slice(1)]
                  : prev
              );
              break;
            case "eval_start":
              setPhase("evaluating");
              break;
            case "eval_complete": {
              setPhase("complete");
              const passed = data.passed === "true" || data.passed === "True";
              setFinalResult(passed);
              es.close();
              eventSourceRef.current = null;
              onComplete?.();
              hideTimerRef.current = setTimeout(() => setVisible(false), 8000);
              break;
            }
            case "error":
              setPhase("error");
              es.close();
              eventSourceRef.current = null;
              onComplete?.();
              hideTimerRef.current = setTimeout(() => setVisible(false), 8000);
              break;
          }
        } catch {}
      };

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
      };
    }, 1000);

    return () => {
      clearTimeout(connectDelay);
    };
  }, [runTrigger, testId]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [events]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (eventSourceRef.current) eventSourceRef.current.close();
    };
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3 }}
          data-testid="live-execution-panel"
        >
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">Live Execution</h3>
                  {phase !== "complete" && phase !== "error" && phase !== "idle" && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                  )}
                  {phase === "complete" && finalResult !== null && (
                    <Badge
                      variant="default"
                      className={`no-default-hover-elevate no-default-active-elevate ${
                        finalResult
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          : "bg-red-500/15 text-red-700 dark:text-red-400"
                      }`}
                      data-testid="badge-final-result"
                    >
                      {finalResult ? (
                        <>
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Passed
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3 w-3 mr-1" />
                          Failed
                        </>
                      )}
                    </Badge>
                  )}
                  {phase === "error" && (
                    <Badge
                      variant="default"
                      className="bg-red-500/15 text-red-700 dark:text-red-400 no-default-hover-elevate no-default-active-elevate"
                      data-testid="badge-error"
                    >
                      <XCircle className="h-3 w-3 mr-1" />
                      Error
                    </Badge>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setVisible(false)}
                  data-testid="button-close-live"
                >
                  Dismiss
                </Button>
              </div>

              {phase !== "idle" && <PhaseIndicator current={phase} />}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  {streamingUrl && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Browser Preview</p>
                      <div className="rounded-md overflow-hidden border aspect-video bg-muted">
                        <iframe
                          src={streamingUrl}
                          className="w-full h-full"
                          title="Browser Preview"
                          sandbox="allow-same-origin allow-scripts"
                          data-testid="iframe-preview"
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        asChild
                      >
                        <a
                          href={streamingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid="link-preview"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Open Preview
                        </a>
                      </Button>
                    </div>
                  )}

                  {!streamingUrl && phase === "browsing" && (
                    <div className="rounded-md border aspect-video bg-muted flex items-center justify-center">
                      <div className="text-center space-y-2">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">Waiting for browser preview...</p>
                      </div>
                    </div>
                  )}
                </div>

                {steps.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Steps</p>
                    <StepTracker steps={steps} />
                  </div>
                )}
              </div>

              {events.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Event Log</p>
                  <div
                    ref={logRef}
                    className="font-mono text-xs space-y-0.5 max-h-36 overflow-y-auto rounded-md bg-muted/50 p-3"
                    data-testid="event-log"
                  >
                    {events.map((e, i) => {
                      let ts = "";
                      try {
                        ts = new Date(e.timestamp).toLocaleTimeString("en-US", {
                          hour12: false,
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        });
                      } catch {
                        ts = "??:??:??";
                      }
                      return (
                        <div key={i} className="flex gap-2" data-testid={`event-entry-${i}`}>
                          <span className="text-muted-foreground shrink-0">{ts}</span>
                          <span className={e.type === "error" ? "text-red-500" : ""}>
                            {e.message}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
