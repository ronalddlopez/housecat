import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FlaskConical,
  Plus,
  Play,
  Pencil,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Pause,
  ExternalLink,
} from "lucide-react";

const SCHEDULE_OPTIONS = [
  { label: "Every 5 minutes", value: "*/5 * * * *" },
  { label: "Every 15 minutes", value: "*/15 * * * *" },
  { label: "Every 30 minutes", value: "*/30 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Every 12 hours", value: "0 */12 * * *" },
  { label: "Daily", value: "0 9 * * *" },
];

function scheduleLabel(cron: string): string {
  const match = SCHEDULE_OPTIONS.find((o) => o.value === cron);
  return match ? match.label : cron;
}

interface TestSuite {
  id: string;
  name: string;
  url: string;
  goal: string;
  schedule: string;
  schedule_id?: string;
  alert_webhook?: string;
  status: string;
  last_result: string;
  last_run_at?: string;
  created_at: string;
  updated_at: string;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "active") {
    return (
      <Badge
        variant="default"
        className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 no-default-hover-elevate no-default-active-elevate"
        data-testid="badge-status-active"
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
        data-testid="badge-status-paused"
      >
        Paused
      </Badge>
    );
  }
  return (
    <Badge
      variant="default"
      className="bg-red-500/15 text-red-700 dark:text-red-400 no-default-hover-elevate no-default-active-elevate"
      data-testid="badge-status-error"
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

interface FormState {
  name: string;
  url: string;
  goal: string;
  schedule: string;
  alert_webhook: string;
}

const emptyForm: FormState = {
  name: "",
  url: "",
  goal: "",
  schedule: "*/15 * * * *",
  alert_webhook: "",
};

export default function TestsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editTest, setEditTest] = useState<TestSuite | null>(null);
  const [deleteTest, setDeleteTest] = useState<TestSuite | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const { data, isLoading } = useQuery<{ tests: TestSuite[]; total: number }>({
    queryKey: ["/api/tests"],
    refetchInterval: 30000,
  });

  const tests = data?.tests || [];

  const createMutation = useMutation({
    mutationFn: (body: FormState) => apiRequest("POST", "/api/tests", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tests"] });
      setCreateOpen(false);
      setForm(emptyForm);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<FormState> }) =>
      apiRequest("PUT", `/api/tests/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tests"] });
      setEditTest(null);
      setForm(emptyForm);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/tests/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tests"] });
      setDeleteTest(null);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PUT", `/api/tests/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tests"] });
    },
  });

  function openCreate() {
    setForm(emptyForm);
    setCreateOpen(true);
  }

  function openEdit(t: TestSuite) {
    setForm({
      name: t.name,
      url: t.url,
      goal: t.goal,
      schedule: t.schedule,
      alert_webhook: t.alert_webhook || "",
    });
    setEditTest(t);
  }

  const formValid =
    form.name.trim().length > 0 &&
    form.url.trim().length > 0 &&
    form.goal.trim().length > 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Tests</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your test suites and view results
          </p>
        </div>
        <Button onClick={openCreate} data-testid="button-new-test">
          <Plus className="h-4 w-4" />
          New Test
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && tests.length === 0 && (
        <Card>
          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center text-center space-y-4">
              <div className="rounded-md bg-muted p-3">
                <FlaskConical className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="space-y-1.5">
                <p className="font-semibold" data-testid="text-empty-state">
                  No test suites created yet
                </p>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Create your first test suite to start monitoring your services automatically.
                </p>
              </div>
              <Button onClick={openCreate} data-testid="button-create-first-test">
                <Plus className="h-4 w-4" />
                Create Your First Test
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoading && tests.length > 0 && (
        <div className="space-y-3">
          {tests.map((t) => (
            <Card key={t.id} data-testid={`card-test-${t.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <Link
                    href={`/tests/${t.id}`}
                    className="space-y-1.5 min-w-0 flex-1 cursor-pointer"
                    data-testid={`link-test-detail-${t.id}`}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm" data-testid={`text-test-name-${t.id}`}>
                        {t.name}
                      </p>
                      <StatusBadge status={t.status} />
                      <ResultBadge result={t.last_result} />
                    </div>
                    <p className="text-xs text-muted-foreground truncate" data-testid={`text-test-url-${t.id}`}>
                      {t.url}
                    </p>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {scheduleLabel(t.schedule)}
                      </span>
                      {t.last_run_at && t.last_run_at.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          Last run: {new Date(t.last_run_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </Link>
                  <div className="flex items-center gap-1 shrink-0">
                    <RunNowButton testId={t.id} />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        toggleMutation.mutate({
                          id: t.id,
                          status: t.status === "active" ? "paused" : "active",
                        })
                      }
                      data-testid={`button-toggle-${t.id}`}
                    >
                      {t.status === "active" ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEdit(t)}
                      data-testid={`button-edit-${t.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setDeleteTest(t)}
                      data-testid={`button-delete-${t.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setForm(emptyForm);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Test Suite</DialogTitle>
          </DialogHeader>
          <TestForm
            form={form}
            setForm={setForm}
            disabled={createMutation.isPending}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={createMutation.isPending}
              data-testid="button-cancel-create"
            >
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate(form)}
              disabled={!formValid || createMutation.isPending}
              data-testid="button-submit-create"
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Test
            </Button>
          </DialogFooter>
          {createMutation.isError && (
            <p className="text-sm text-red-600 dark:text-red-400" data-testid="text-create-error">
              {createMutation.error.message}
            </p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editTest}
        onOpenChange={(open) => {
          if (!open) {
            setEditTest(null);
            setForm(emptyForm);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Test Suite</DialogTitle>
          </DialogHeader>
          <TestForm
            form={form}
            setForm={setForm}
            disabled={updateMutation.isPending}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditTest(null)}
              disabled={updateMutation.isPending}
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                editTest &&
                updateMutation.mutate({ id: editTest.id, body: form })
              }
              disabled={!formValid || updateMutation.isPending}
              data-testid="button-submit-edit"
            >
              {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
          {updateMutation.isError && (
            <p className="text-sm text-red-600 dark:text-red-400" data-testid="text-edit-error">
              {updateMutation.error.message}
            </p>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTest}
        onOpenChange={(open) => {
          if (!open) setDeleteTest(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Test Suite</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deleteTest?.name}&rdquo;? This will remove the
              test and its scheduled checks. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTest && deleteMutation.mutate(deleteTest.id)}
              className="bg-red-600 text-white hover:bg-red-700 border-red-600"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RunNowButton({ testId }: { testId: string }) {
  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/tests/${testId}/run`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tests", testId] });
    },
  });

  return (
    <Button
      size="icon"
      variant="ghost"
      aria-label={`Run test ${testId}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        mutation.mutate();
      }}
      disabled={mutation.isPending}
      data-testid={`button-run-${testId}`}
    >
      {mutation.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Play className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
      )}
    </Button>
  );
}

function TestForm({
  form,
  setForm,
  disabled,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium mb-1.5 block">Name</label>
        <Input
          placeholder="Login Flow"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          disabled={disabled}
          data-testid="input-test-name"
        />
      </div>
      <div>
        <label className="text-sm font-medium mb-1.5 block">URL</label>
        <Input
          type="url"
          placeholder="https://myapp.com/login"
          value={form.url}
          onChange={(e) => setForm({ ...form, url: e.target.value })}
          disabled={disabled}
          data-testid="input-test-url"
        />
      </div>
      <div>
        <label className="text-sm font-medium mb-1.5 block">Goal</label>
        <Textarea
          placeholder="Describe what to test in plain English..."
          value={form.goal}
          onChange={(e) => setForm({ ...form, goal: e.target.value })}
          disabled={disabled}
          rows={3}
          className="resize-none"
          data-testid="input-test-goal"
        />
      </div>
      <div>
        <label className="text-sm font-medium mb-1.5 block">Schedule</label>
        <Select
          value={form.schedule}
          onValueChange={(v) => setForm({ ...form, schedule: v })}
          disabled={disabled}
        >
          <SelectTrigger data-testid="select-schedule">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCHEDULE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} data-testid={`option-schedule-${opt.value}`}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-sm font-medium mb-1.5 block">
          Alert Webhook <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <Input
          type="url"
          placeholder="https://hooks.slack.com/..."
          value={form.alert_webhook}
          onChange={(e) => setForm({ ...form, alert_webhook: e.target.value })}
          disabled={disabled}
          data-testid="input-alert-webhook"
        />
      </div>
    </div>
  );
}
