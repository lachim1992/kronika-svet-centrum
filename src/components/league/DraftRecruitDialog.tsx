import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

const SPHAERA_POSITIONS = ["striker", "guardian", "carrier", "praetor", "exactor"];
const POS_LABELS: Record<string, string> = {
  praetor: "Praetor", guardian: "Strážce", striker: "Útočník", carrier: "Nositel", exactor: "Exaktor",
};

/** Convert academy stats to Sphaera league_player stats */
function convertToSphaera(student: any) {
  const str = student.strength || 50;
  const end = student.endurance || 50;
  const agi = student.agility || 50;
  const tac = student.tactics || 50;
  const cha = student.charisma || 50;

  const speed = Math.min(99, Math.round(agi * 0.7 + end * 0.2 + Math.random() * 8));
  const technique = Math.min(99, Math.round(tac * 0.5 + agi * 0.3 + cha * 0.1 + Math.random() * 6));
  const stamina = Math.min(99, Math.round(end * 0.7 + str * 0.2 + Math.random() * 6));
  const strength = Math.min(99, Math.round(str * 0.8 + end * 0.1 + Math.random() * 6));
  const aggression = Math.min(99, Math.round(str * 0.4 + tac * 0.3 + Math.random() * 10));
  const leadership = Math.min(99, Math.round(cha * 0.6 + tac * 0.3 + Math.random() * 6));

  const overall = Math.round((speed + technique + stamina + strength + aggression + leadership) / 6);

  return { speed, technique, stamina, strength, aggression, leadership, overall };
}

/** Suggest best position based on stats */
function suggestPosition(student: any): string {
  const str = student.strength || 50;
  const agi = student.agility || 50;
  const tac = student.tactics || 50;
  const cha = student.charisma || 50;

  const scores: Record<string, number> = {
    striker: agi * 0.5 + str * 0.3 + tac * 0.2,
    guardian: str * 0.5 + tac * 0.3 + agi * 0.2,
    carrier: agi * 0.4 + tac * 0.4 + cha * 0.2,
    praetor: tac * 0.5 + cha * 0.3 + agi * 0.2,
    exactor: str * 0.4 + agi * 0.4 + tac * 0.2,
  };

  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
}

interface Team {
  id: string;
  team_name: string;
  city_id: string;
  color_primary: string;
  color_secondary: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  student: any;
  teams: Team[];
  sessionId: string;
  cityNames: Map<string, string>;
  onDrafted: () => void;
}

export default function DraftRecruitDialog({ open, onOpenChange, student, teams, sessionId, cityNames, onDrafted }: Props) {
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [selectedPosition, setSelectedPosition] = useState<string>("");
  const [drafting, setDrafting] = useState(false);

  if (!student) return null;

  const sphaera = convertToSphaera(student);
  const suggested = suggestPosition(student);

  const handleDraft = async () => {
    if (!selectedTeam) { toast.error("Vyber tým"); return; }
    const pos = selectedPosition || suggested;

    setDrafting(true);
    try {
      // Insert league_player
      const { error: insertErr } = await supabase.from("league_players").insert({
        session_id: sessionId,
        team_id: selectedTeam,
        name: student.name,
        position: pos,
        overall_rating: sphaera.overall,
        speed: sphaera.speed,
        technique: sphaera.technique,
        stamina: sphaera.stamina,
        strength: sphaera.strength,
        aggression: sphaera.aggression,
        leadership: sphaera.leadership,
        form: 60 + Math.floor(Math.random() * 20),
        condition: 80 + Math.floor(Math.random() * 20),
        talent_potential: Math.min(99, sphaera.overall + 5 + Math.floor(Math.random() * 10)),
        portrait_url: student.portrait_url,
        bio: student.bio,
      } as any);

      if (insertErr) throw insertErr;

      // Update student status to drafted
      const { error: updateErr } = await supabase.from("academy_students")
        .update({ status: "drafted" } as any)
        .eq("id", student.id);

      if (updateErr) throw updateErr;

      toast.success(`${student.name} draftován jako ${POS_LABELS[pos] || pos}!`);
      onDrafted();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Chyba draftu: " + (e.message || "neznámá"));
    } finally {
      setDrafting(false);
    }
  };

  const statColor = (v: number) => {
    if (v >= 75) return "text-green-400";
    if (v >= 55) return "text-yellow-400";
    if (v >= 40) return "text-orange-400";
    return "text-red-400";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Draft — {student.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Sphaera stats preview */}
          <div className="rounded border border-border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold font-display">{student.name}</span>
              <Badge className={`text-sm font-bold ${statColor(sphaera.overall)}`} variant="outline">
                OVR {sphaera.overall}
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {([
                ["Rychlost", sphaera.speed],
                ["Technika", sphaera.technique],
                ["Výdrž", sphaera.stamina],
                ["Síla", sphaera.strength],
                ["Agrese", sphaera.aggression],
                ["Vedení", sphaera.leadership],
              ] as [string, number][]).map(([label, val]) => (
                <div key={label} className="flex justify-between bg-card/50 rounded px-2 py-1">
                  <span className="text-muted-foreground">{label}</span>
                  <span className={`font-mono font-semibold ${statColor(val)}`}>{val}</span>
                </div>
              ))}
            </div>
            <div className="text-xs text-muted-foreground">
              Doporučená pozice: <span className="text-foreground font-semibold">{POS_LABELS[suggested]}</span>
            </div>
          </div>

          {/* Team selection */}
          <div className="space-y-2">
            <label className="text-xs font-semibold">Vybrat tým</label>
            <Select value={selectedTeam} onValueChange={setSelectedTeam}>
              <SelectTrigger>
                <SelectValue placeholder="Vyber tým..." />
              </SelectTrigger>
              <SelectContent>
                {teams.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: t.color_primary || "#888" }} />
                      <span>{t.team_name}</span>
                      <span className="text-muted-foreground text-xs">({cityNames.get(t.city_id) || "?"})</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Position selection */}
          <div className="space-y-2">
            <label className="text-xs font-semibold">Pozice</label>
            <Select value={selectedPosition || suggested} onValueChange={setSelectedPosition}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SPHAERA_POSITIONS.map(p => (
                  <SelectItem key={p} value={p}>
                    {POS_LABELS[p]} {p === suggested && "(doporučeno)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={drafting}>Zrušit</Button>
          <Button onClick={handleDraft} disabled={drafting || !selectedTeam}>
            {drafting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <UserPlus className="h-4 w-4 mr-1" />}
            Draftovat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { convertToSphaera, suggestPosition, POS_LABELS as SPHAERA_POS_LABELS };
