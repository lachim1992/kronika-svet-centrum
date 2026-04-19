import { Check, Loader2, X, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BootstrapStepRecord } from "@/types/worldBootstrap";

// Canonical 8 steps in the order create-world-bootstrap emits them.
// Mirrors supabase/functions/create-world-bootstrap/index.ts.
export const CANONICAL_BOOTSTRAP_STEPS: Array<{ key: string; label: string }> = [
  { key: "validate-normalize", label: "Validace vstupu" },
  { key: "world-foundations", label: "Základy světa" },
  { key: "server-config", label: "Konfigurace serveru" },
  { key: "persist-worldgen-spec", label: "Uložení specifikace" },
  { key: "generate-world-map", label: "Generování mapy" },
  { key: "placement-artifacts", label: "Startovní pozice" },
  { key: "mode-specific-seeding", label: "Inicializace módu" },
  { key: "finalize-world-ready", label: "Dokončení" },
];

export type StepStatus = "pending" | "running" | "done" | "failed";

interface BootstrapProgressPanelProps {
  /** Steps received from the bootstrap response (live or final). */
  receivedSteps?: BootstrapStepRecord[];
  /** Index of the step currently believed to be running (for the running spinner). */
  activeIndex?: number;
  bootstrapError?: string | null;
}

function statusFor(
  stepKey: string,
  receivedSteps: BootstrapStepRecord[] | undefined,
  activeIndex: number | undefined,
  canonicalIndex: number,
  hasError: boolean,
): StepStatus {
  const rec = receivedSteps?.find((s) => s.step === stepKey);
  if (rec) {
    if (!rec.ok) return "failed";
    return "done";
  }
  // No record yet
  if (hasError && activeIndex !== undefined && canonicalIndex === activeIndex) {
    return "failed";
  }
  if (activeIndex !== undefined && canonicalIndex === activeIndex) return "running";
  if (activeIndex !== undefined && canonicalIndex < activeIndex) return "done";
  return "pending";
}

const STATUS_CONFIG: Record<StepStatus, { icon: typeof Check; className: string }> = {
  pending: { icon: Circle, className: "text-muted-foreground/50" },
  running: { icon: Loader2, className: "text-primary animate-spin" },
  done: { icon: Check, className: "text-green-500" },
  failed: { icon: X, className: "text-destructive" },
};

export const BootstrapProgressPanel = ({
  receivedSteps,
  activeIndex,
  bootstrapError,
}: BootstrapProgressPanelProps) => {
  const hasError = !!bootstrapError;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold">Postup vytváření světa</h4>
      <ol className="space-y-1.5">
        {CANONICAL_BOOTSTRAP_STEPS.map((step, idx) => {
          const status = statusFor(
            step.key,
            receivedSteps,
            activeIndex,
            idx,
            hasError,
          );
          const cfg = STATUS_CONFIG[status];
          const Icon = cfg.icon;
          const rec = receivedSteps?.find((s) => s.step === step.key);
          return (
            <li
              key={step.key}
              className={cn(
                "flex items-center gap-2 text-sm rounded-md px-2 py-1.5",
                status === "running" && "bg-primary/10",
                status === "failed" && "bg-destructive/10",
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", cfg.className)} />
              <span
                className={cn(
                  "flex-1 truncate",
                  status === "pending" && "text-muted-foreground",
                  status === "failed" && "text-destructive font-medium",
                )}
              >
                {step.label}
              </span>
              {rec && status === "done" && (
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {Math.round(rec.durationMs)}ms
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {bootstrapError && (
        <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded p-2 mt-2">
          <div className="font-semibold mb-0.5">Chyba bootstrapu:</div>
          {bootstrapError}
        </div>
      )}
    </div>
  );
};
