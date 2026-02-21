import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { ListOrdered, Plus, X, Clock, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  currentPlayerName: string;
}

interface QueueAction {
  id: string;
  action_type: string;
  action_data: Record<string, any>;
  status: string;
  started_at: string;
  completes_at: string;
  created_at: string;
}

const ACTION_TYPES = [
  { value: "build", label: "Stavba" },
  { value: "research", label: "Výzkum" },
  { value: "recruit", label: "Nábor" },
  { value: "march", label: "Pochod" },
  { value: "trade", label: "Obchod" },
  { value: "diplomacy", label: "Diplomacie" },
];

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "Čekající", color: "secondary" },
  in_progress: { label: "Probíhá", color: "default" },
  completed: { label: "Dokončeno", color: "outline" },
  cancelled: { label: "Zrušeno", color: "destructive" },
};

const ActionQueuePanel = ({ sessionId, currentPlayerName }: Props) => {
  const [actions, setActions] = useState<QueueAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState("build");
  const [newNote, setNewNote] = useState("");
  const [newMinutes, setNewMinutes] = useState(60);

  const fetchActions = useCallback(async () => {
    const { data } = await supabase
      .from("action_queue")
      .select("*")
      .eq("session_id", sessionId)
      .eq("player_name", currentPlayerName)
      .order("created_at", { ascending: false });
    setActions((data || []) as QueueAction[]);
    setLoading(false);
  }, [sessionId, currentPlayerName]);

  useEffect(() => { fetchActions(); }, [fetchActions]);

  const handleAdd = async () => {
    setAdding(true);
    const now = new Date();
    const completes = new Date(now.getTime() + newMinutes * 60 * 1000);
    await supabase.from("action_queue").insert({
      session_id: sessionId,
      player_name: currentPlayerName,
      action_type: newType,
      action_data: { note: newNote },
      completes_at: completes.toISOString(),
    });
    setNewNote("");
    setNewMinutes(60);
    toast.success("Akce zařazena do fronty");
    await fetchActions();
    setAdding(false);
  };

  const handleCancel = async (id: string) => {
    await supabase.from("action_queue").update({ status: "cancelled" }).eq("id", id);
    toast.info("Akce zrušena");
    fetchActions();
  };

  const getProgress = (action: QueueAction) => {
    if (action.status === "completed") return 100;
    if (action.status === "cancelled") return 0;
    const start = new Date(action.started_at).getTime();
    const end = new Date(action.completes_at).getTime();
    const now = Date.now();
    if (now >= end) return 100;
    const total = end - start;
    const elapsed = now - start;
    return Math.min(100, Math.round((elapsed / total) * 100));
  };

  const activeActions = actions.filter(a => a.status === "pending" || a.status === "in_progress");
  const completedActions = actions.filter(a => a.status === "completed" || a.status === "cancelled");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ListOrdered className="h-5 w-5 text-primary" />
        <h3 className="font-display font-bold text-base">Fronta akcí</h3>
        <Badge variant="secondary" className="ml-auto">{activeActions.length} aktivních</Badge>
      </div>

      {/* Add new action */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Plus className="h-4 w-4" /> Nová akce
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Select value={newType} onValueChange={setNewType}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTION_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Popis akce..."
              value={newNote}
              onChange={e => setNewNote(e.target.value)}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <Input
              type="number" min={1} max={10080}
              value={newMinutes}
              onChange={e => setNewMinutes(Number(e.target.value))}
              className="w-24"
            />
            <span className="text-xs text-muted-foreground">minut</span>
            <Button size="sm" onClick={handleAdd} disabled={adding || !newNote} className="ml-auto gap-1">
              <Plus className="h-3 w-3" /> Zařadit
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active actions */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Načítání...</p>
      ) : activeActions.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Žádné aktivní akce ve frontě.</p>
      ) : (
        <div className="space-y-2">
          {activeActions.map(a => {
            const progress = getProgress(a);
            const typeLabel = ACTION_TYPES.find(t => t.value === a.action_type)?.label || a.action_type;
            return (
              <Card key={a.id}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">{typeLabel}</Badge>
                      <span className="text-sm font-medium">{a.action_data?.note || "—"}</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCancel(a.id)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  <Progress value={progress} className="h-1.5 mb-1" />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>{progress}%</span>
                    <span>Dokončení: {new Date(a.completes_at).toLocaleString("cs")}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Completed */}
      {completedActions.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground font-display text-xs mb-2">
            Dokončené akce ({completedActions.length})
          </summary>
          <div className="space-y-1">
            {completedActions.slice(0, 10).map(a => (
              <div key={a.id} className="flex items-center gap-2 text-xs text-muted-foreground py-1 px-2 bg-muted/30 rounded">
                {a.status === "completed" ? <CheckCircle2 className="h-3 w-3 text-primary" /> : <X className="h-3 w-3 text-destructive" />}
                <span>{ACTION_TYPES.find(t => t.value === a.action_type)?.label}</span>
                <span className="truncate flex-1">{a.action_data?.note}</span>
                <Badge variant={a.status === "completed" ? "outline" : "destructive"} className="text-[9px]">
                  {STATUS_MAP[a.status]?.label}
                </Badge>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};

export default ActionQueuePanel;
