import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const SCHEDULE_OPTIONS = [
  { label: "Every 5 minutes", value: "*/5 * * * *" },
  { label: "Every 15 minutes", value: "*/15 * * * *" },
  { label: "Every 30 minutes", value: "*/30 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Every 12 hours", value: "0 */12 * * *" },
  { label: "Daily", value: "0 9 * * *" },
];

export function scheduleLabel(cron: string): string {
  const match = SCHEDULE_OPTIONS.find((o) => o.value === cron);
  return match ? match.label : cron;
}

export interface FormState {
  name: string;
  url: string;
  goal: string;
  schedule: string;
  alert_webhook: string;
}

export const emptyForm: FormState = {
  name: "",
  url: "",
  goal: "",
  schedule: "*/15 * * * *",
  alert_webhook: "",
};

export function TestForm({
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
    </div>
  );
}
