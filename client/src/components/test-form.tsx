import { useRef, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, EyeOff, X, Plus } from "lucide-react";

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

export interface Variable {
  name: string;
  value: string;
  hidden: boolean;
}

export interface FormState {
  name: string;
  url: string;
  goal: string;
  schedule: string;
  alert_webhook: string;
  variables: Variable[];
}

export const emptyForm: FormState = {
  name: "",
  url: "",
  goal: "",
  schedule: "*/15 * * * *",
  alert_webhook: "",
  variables: [],
};

function VariableEditor({
  variables,
  onChange,
  disabled,
}: {
  variables: Variable[];
  onChange: (vars: Variable[]) => void;
  disabled: boolean;
}) {
  const addVariable = () => {
    onChange([...variables, { name: "", value: "", hidden: true }]);
  };

  const updateVariable = (index: number, field: keyof Variable, val: string | boolean) => {
    const updated = variables.map((v, i) =>
      i === index ? { ...v, [field]: val } : v
    );
    onChange(updated);
  };

  const removeVariable = (index: number) => {
    onChange(variables.filter((_, i) => i !== index));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium">Variables</label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={addVariable}
          disabled={disabled}
          className="h-7 px-2 text-xs"
        >
          <Plus className="h-3 w-3 mr-1" />
          Add Variable
        </Button>
      </div>
      {variables.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Add variables to use <code className="bg-muted px-1 rounded">{"{{name}}"}</code> placeholders in your goal.
        </p>
      )}
      <div className="space-y-2">
        {variables.map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              placeholder="name"
              value={v.name}
              onChange={(e) => updateVariable(i, "name", e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
              disabled={disabled}
              className="w-[140px] h-8 text-sm font-mono"
            />
            <div className="relative flex-1">
              <Input
                type={v.hidden ? "password" : "text"}
                placeholder="value"
                value={v.value}
                onChange={(e) => updateVariable(i, "value", e.target.value)}
                disabled={disabled}
                className="h-8 text-sm pr-8"
              />
              <button
                type="button"
                onClick={() => updateVariable(i, "hidden", !v.hidden)}
                disabled={disabled}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {v.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <button
              type="button"
              onClick={() => removeVariable(i)}
              disabled={disabled}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function GoalTextarea({
  value,
  onChange,
  disabled,
  variables,
}: {
  value: string;
  onChange: (val: string) => void;
  disabled: boolean;
  variables: Variable[];
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [insertPos, setInsertPos] = useState<{ start: number; end: number } | null>(null);

  const definedVars = variables.filter((v) => v.name.length > 0);

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      onChange(newValue);

      const cursor = e.target.selectionStart;
      const textBefore = newValue.slice(0, cursor);

      // Check if we're inside an unclosed {{ ... }}
      const lastOpen = textBefore.lastIndexOf("{{");
      const lastClose = textBefore.lastIndexOf("}}");

      if (lastOpen > lastClose && definedVars.length > 0) {
        const partial = textBefore.slice(lastOpen + 2).trim();
        setFilter(partial);
        setInsertPos({ start: lastOpen, end: cursor });
        setOpen(true);
      } else {
        setOpen(false);
      }
    },
    [onChange, definedVars.length]
  );

  const selectVariable = (varName: string) => {
    if (!insertPos || !textareaRef.current) return;

    const before = value.slice(0, insertPos.start);
    const after = value.slice(insertPos.end);
    const insertion = `{{${varName}}}`;
    // Remove any trailing }} that may already exist right after cursor
    const cleaned = after.startsWith("}}") ? after.slice(2) : after;
    const newValue = before + insertion + cleaned;

    onChange(newValue);
    setOpen(false);

    // Restore cursor position after the inserted variable
    const newCursor = before.length + insertion.length;
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(newCursor, newCursor);
    });
  };

  const filtered = definedVars.filter((v) =>
    v.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="relative">
      <Popover open={open && filtered.length > 0} onOpenChange={() => {}}>
        <PopoverAnchor asChild>
          <Textarea
            ref={textareaRef}
            placeholder="Describe what to test in plain English... Use {{variableName}} for variables"
            value={value}
            onChange={handleInput}
            disabled={disabled}
            rows={3}
            className="resize-none"
            data-testid="input-test-goal"
            onBlur={() => {
              // Delay closing so click on popover item registers first
              setTimeout(() => setOpen(false), 150);
            }}
            onKeyDown={(e) => {
              if (open && e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
              }
            }}
          />
        </PopoverAnchor>
        <PopoverContent
          className="w-[200px] p-0"
          align="start"
          side="bottom"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <Command>
            <CommandList>
              <CommandEmpty>No variables found</CommandEmpty>
              <CommandGroup>
                {filtered.map((v) => (
                  <CommandItem
                    key={v.name}
                    value={v.name}
                    onSelect={() => selectVariable(v.name)}
                    onMouseDown={(e) => e.preventDefault()}
                    className="font-mono text-sm cursor-pointer"
                  >
                    {v.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

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
        <GoalTextarea
          value={form.goal}
          onChange={(goal) => setForm({ ...form, goal })}
          disabled={disabled}
          variables={form.variables}
        />
      </div>
      <VariableEditor
        variables={form.variables}
        onChange={(variables) => setForm({ ...form, variables })}
        disabled={disabled}
      />
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
