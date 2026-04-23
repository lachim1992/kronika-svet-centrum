import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { dispatchCommand } from "@/lib/commands";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, Swords, AlertTriangle, Loader2, Check } from "lucide-react";
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
  /** The new manpower cap the player wants — must demobilize enough to fit */
  targetCap: number;
  onDone: () => void;
}

const DemobilizeDialog = ({
  open, onClose, stacks, sessionId, playerName, currentTurn,
  realmId, manpowerCommitted, targetCap, onDone,
}: DemobilizeDialogProps) => {
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const excessManpower = Math.max(0, manpowerCommitted - targetCap);

  const selectedManpower = useMemo(() => {
    return stacks
      .filter(s => selectedIds.has(s.id))
      .reduce((sum, s) => sum + s.totalManpower, 0);
  }, [selectedIds, stacks]);

  const isEnoughSelected = selectedManpower >= excessManpower;

  const toggleStack = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDemobilize = async () => {
    if (!isEnoughSelected) return;
    const toDisband = stacks.filter(s => selectedIds.has(s.id));

    setSaving(true);
    try {
      const totalReturned = toDisband.reduce((sum, s) => sum + s.totalManpower, 0);
      const names = toDisband.map(s => s.name).join(", ");

      const res = await dispatchCommand({
        sessionId,
        actor: { name: playerName },
        commandType: "DEMOBILIZE_STACK",
        commandPayload: {
          stackIds: toDisband.map(s => s.id),
          stackNames: names,
          returnedManpower: totalReturned,
          readyTurn: currentTurn + 3,
          chronicleText: `${playerName} demobilizoval **${names}** (${totalReturned} mužů). Jednotky budou připraveny k reaktivaci za 3 kola.`,
        },
      });
      if (!res.ok) { toast.error(res.error || "Demobilizace selhala"); setSaving(false); return; }

      toast.success(`Demobilizováno ${toDisband.length} jednotek — ${totalReturned} mužů vráceno`);
      setSelectedIds(new Set());
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
            Demobilizace jednotek
          </DialogTitle>
          <DialogDescription>
            Snížením mobilizace musíte uvolnit minimálně <strong className="text-foreground">{excessManpower}</strong> mužů.
            Vyberte jednotky k demobilizaci — vrátí se do pracovní síly, reaktivace trvá 3 kola.
          </DialogDescription>
        </DialogHeader>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Vybráno: {selectedManpower} / {excessManpower} potřeba</span>
            {isEnoughSelected && <span className="text-primary font-semibold">✓ Dostatečné</span>}
          </div>
          <div className="w-full bg-muted rounded h-2">
            <div
              className={`rounded h-2 transition-all ${isEnoughSelected ? "bg-primary" : "bg-destructive"}`}
              style={{ width: `${Math.min(100, excessManpower > 0 ? (selectedManpower / excessManpower) * 100 : 100)}%` }}
            />
          </div>
        </div>

        <div className="space-y-2 max-h-60 overflow-y-auto">
          {stacks.map(s => {
            const selected = selectedIds.has(s.id);
            return (
              <button
                key={s.id}
                onClick={() => toggleStack(s.id)}
                className={`w-full flex items-center justify-between p-3 rounded-lg border text-left transition-colors ${
                  selected
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card/60 hover:border-primary/30"
                }`}
              >
                <div className="flex items-center gap-2">
                  {selected ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : (
                    <Shield className="h-4 w-4 text-muted-foreground" />
                  )}
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
            );
          })}
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
            disabled={!isEnoughSelected || saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Swords className="h-4 w-4 mr-1" />}
            Demobilizovat ({selectedIds.size})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DemobilizeDialog;
