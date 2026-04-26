import { useEffect, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, XCircle, ChevronDown, Activity, Trash2 } from "lucide-react";

interface PhaseResult {
  ok?: boolean;
  error?: string;
  skipped?: boolean;
  reason?: string;
  processed?: number;
  total?: number;
  entities?: number;
  failures?: { name: string; error: string }[];
  durationMs?: number;
  [k: string]: any;
}

interface CommitTurnReport {
  ts: number;
  turn: number;
  sessionId: string;
  criticalMs?: number;
  ok: boolean;
  topError?: string;
  results: Record<string, PhaseResult>;
}

const STORAGE_KEY = "commitTurnReport";

export function saveCommitTurnReport(report: CommitTurnReport) {
  try {
    localStorage.setItem(`${STORAGE_KEY}:${report.sessionId}`, JSON.stringify(report));
    window.dispatchEvent(new CustomEvent("commit-turn-report-updated"));
  } catch { /* ignore */ }
}

interface Props {
  sessionId: string;
}

const phaseLabels: Record<string, string> = {
  worldTick: "World Tick (fyzika)",
  processTick: "Process Tick",
  autoResolvedLobbies: "Auto-resolved Bitvy",
  aiFactions: "AI Frakce (tahy + bitvy)",
  diplomaticPacts: "Diplomatické pakty",
  tradeProcessing: "Obchodní nabídky",
  routes: "Trasy",
  preHexFlows: "Hex toky (pre)",
  economyFlow: "Ekonomický tok",
  tradeFlows: "Obchodní toky",
  economy: "Ekonomika hráčů (process-turn)",
  hexFlows: "Hex toky",
  collapseChain: "Kaskádové krize",
  worldLayer: "World Layer",
};

function statusOf(r: PhaseResult): "ok" | "warn" | "error" | "skip" {
  if (!r) return "skip";
  if (r.error) return "error";
  if (r.skipped) return "skip";
  if (r.failures && r.failures.length > 0) return "warn";
  if (r.total && r.processed !== undefined && r.processed < r.total) return "warn";
  if (r.entities && r.processed !== undefined && r.processed < r.entities) return "warn";
  return "ok";
}

const StatusIcon = ({ s }: { s: ReturnType<typeof statusOf> }) => {
  if (s === "ok") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  if (s === "warn") return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
  if (s === "error") return <XCircle className="h-3.5 w-3.5 text-red-500" />;
  return <div className="h-3.5 w-3.5 rounded-full bg-muted" />;
};

const TurnExecutionReport = ({ sessionId }: Props) => {
  const [report, setReport] = useState<CommitTurnReport | null>(null);
  const [open, setOpen] = useState(false);

  const load = () => {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY}:${sessionId}`);
      setReport(raw ? JSON.parse(raw) : null);
    } catch { setReport(null); }
  };

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("commit-turn-report-updated", handler);
    return () => window.removeEventListener("commit-turn-report-updated", handler);
  }, [sessionId]);

  if (!report) return null;

  const phases = Object.entries(report.results || {});
  const errorPhases = phases.filter(([, r]) => statusOf(r) === "error");
  const warnPhases = phases.filter(([, r]) => statusOf(r) === "warn");
  const overallStatus: "ok" | "warn" | "error" =
    errorPhases.length > 0 ? "error" : warnPhases.length > 0 ? "warn" : "ok";

  const totalFailures = phases.reduce((sum, [, r]) => sum + (r.failures?.length || 0), 0);
  const ageMin = Math.round((Date.now() - report.ts) / 60000);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-md border border-border bg-card/50">
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between px-3 py-2 hover:bg-accent/30 transition">
            <div className="flex items-center gap-2 text-xs">
              <Activity className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-display font-semibold">Report posledního tahu</span>
              <Badge variant="outline" className="text-[10px] py-0">T{report.turn}</Badge>
              {overallStatus === "ok" && (
                <Badge className="text-[10px] py-0 bg-emerald-500/20 text-emerald-400 border-emerald-500/40">OK</Badge>
              )}
              {overallStatus === "warn" && (
                <Badge className="text-[10px] py-0 bg-amber-500/20 text-amber-400 border-amber-500/40">
                  {totalFailures} chyb
                </Badge>
              )}
              {overallStatus === "error" && (
                <Badge className="text-[10px] py-0 bg-red-500/20 text-red-400 border-red-500/40">
                  {errorPhases.length} fází selhalo
                </Badge>
              )}
              <span className="text-muted-foreground">
                {report.criticalMs ? `${(report.criticalMs / 1000).toFixed(1)}s` : ""} · před {ageMin}m
              </span>
            </div>
            <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border/50">
            {report.topError && (
              <div className="text-xs p-2 rounded bg-red-500/10 text-red-300 border border-red-500/30">
                Hlavní chyba: {report.topError}
              </div>
            )}

            <div className="space-y-1">
              {phases.map(([key, r]) => {
                const s = statusOf(r);
                const label = phaseLabels[key] || key;
                return (
                  <div key={key} className="text-[11px]">
                    <div className="flex items-center gap-2">
                      <StatusIcon s={s} />
                      <span className="font-medium">{label}</span>
                      {r.durationMs !== undefined && (
                        <span className="text-muted-foreground">
                          {(r.durationMs / 1000).toFixed(2)}s
                        </span>
                      )}
                      {r.processed !== undefined && (r.total || r.entities) && (
                        <span className="text-muted-foreground">
                          {r.processed}/{r.total ?? r.entities}
                        </span>
                      )}
                      {r.skipped && (
                        <span className="text-muted-foreground italic">
                          přeskočeno{r.reason ? ` — ${r.reason}` : ""}
                        </span>
                      )}
                    </div>
                    {r.error && (
                      <div className="ml-5 mt-0.5 text-red-400 break-words">⨯ {r.error}</div>
                    )}
                    {r.failures && r.failures.length > 0 && (
                      <ul className="ml-5 mt-0.5 space-y-0.5">
                        {r.failures.map((f, i) => (
                          <li key={i} className="text-amber-400 break-words">
                            ⚠ <span className="font-medium">{f.name}</span>: {f.error}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between items-center pt-1">
              <span className="text-[10px] text-muted-foreground">
                {new Date(report.ts).toLocaleString()}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] gap-1"
                onClick={() => {
                  localStorage.removeItem(`${STORAGE_KEY}:${sessionId}`);
                  setReport(null);
                }}
              >
                <Trash2 className="h-3 w-3" /> Vymazat
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

export default TurnExecutionReport;
