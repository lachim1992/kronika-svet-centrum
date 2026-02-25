import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { dispatchCommand } from "@/lib/commands";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, Swords, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Stack {
  id: string;
  name: string;
  formation_type: string;
  totalManpower: number;
  morale: number;
}

interface DemobilizeDialogProps {
  open: boolean;
  onClose: () => void;
  stacks: Stack[];
  sessionId: string;
  playerName: string;
  currentTurn: number;
  realmId: string;
  manpowerCommitted: number;
  onDone: () => void;
}

const DemobilizeDialog = ({
  open, onClose, stacks, sessionId, playerName, currentTurn,
  realmId, manpowerCommitted, onDone,
}: DemobilizeDialogProps) => {
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleDemobilize = async () => {
    if (!selectedId) return;
    const stack = stacks.find(s => s.id === selectedId);
    if (!stack) return;

    setSaving(true);
    try {
      // Mark as demobilized (not disbanded — can be reactivated in 3 turns)
      await supabase.from("military_stacks").update({
        is_active: false,
        demobilized_turn: currentTurn,
        remobilize_ready_turn: currentTurn + 3,
      } as any).eq("id", stack.id);

      // Return manpower to pool
      await supabase.from("realm_resources").update({
        manpower_committed: Math.max(0, manpowerCommitted - stack.totalManpower),
      }).eq("id", realmId);

      // Log command
      await dispatchCommand({
        sessionId,
        actor: { name: playerName },
        commandType: "DEMOBILIZE_STACK",
        commandPayload: {
          stackId: stack.id,
          stackName: stack.name,
          returnedManpower: stack.totalManpower,
          readyTurn: currentTurn + 3,
          chronicleText: `${playerName} demobilizoval **${stack.name}** (${stack.totalManpower} mužů). Jednotka bude připravena k reaktivaci za 3 kola.`,
        },
      });

      toast.success(`${stack.name} demobilizována — reaktivace za 3 kola`);
      onDone();
      onClose();
    } catch (e: any) {
      toast.error("Chyba při demobilizaci: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => !saving && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Demobilizace jednotky
          </DialogTitle>
          <DialogDescription>
            Nelze snížit mobilizaci pod úroveň nasazených vojáků. Vyberte jednotku k demobilizaci — vrátí se do pracovní síly, ale její reaktivace bude trvat 3 kola s nižší morálkou.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-60 overflow-y-auto">
          {stacks.map(s => (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              className={`w-full flex items-center justify-between p-3 rounded-lg border text-left transition-colors ${
                selectedId === s.id
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card/60 hover:border-primary/30"
              }`}
            >
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="font-semibold text-sm">{s.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.totalManpower} mužů · Morálka {s.morale}
                  </div>
                </div>
              </div>
              <Badge variant="secondary" className="text-[10px]">
                {s.formation_type}
              </Badge>
            </button>
          ))}
          {stacks.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Žádné aktivní jednotky k demobilizaci.
            </p>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Zrušit
          </Button>
          <Button
            variant="destructive"
            onClick={handleDemobilize}
            disabled={!selectedId || saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Swords className="h-4 w-4 mr-1" />}
            Demobilizovat
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DemobilizeDialog;
