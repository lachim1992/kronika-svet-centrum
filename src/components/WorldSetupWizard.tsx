import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Globe, Sparkles, Swords, Users, X, Plus } from "lucide-react";
import { toast } from "sonner";

const TONES = [
  { value: "mythic", label: "🏛️ Mýtický", desc: "Bohové, proroctví, epická vyprávění" },
  { value: "realistic", label: "📜 Realistický", desc: "Historicky věrný, pragmatický" },
  { value: "dark_fantasy", label: "🌑 Dark Fantasy", desc: "Temné síly, intriky, magie" },
  { value: "sci_fi", label: "🚀 Sci-Fi", desc: "Technologie, vesmír, futurismus" },
];

const VICTORY_STYLES = [
  { value: "domination", label: "⚔️ Dominace", desc: "Vojenská nadvláda" },
  { value: "survival", label: "🛡️ Přežití", desc: "Přežijte krize a katastrofy" },
  { value: "story", label: "📖 Příběh", desc: "Nejlepší příběh vyhrává" },
];

interface Props {
  userId: string;
  defaultPlayerName: string;
  onCreated: (sessionId: string) => void;
  onCancel: () => void;
}

const WorldSetupWizard = ({ userId, defaultPlayerName, onCreated, onCancel }: Props) => {
  const [step, setStep] = useState(1);
  const [worldName, setWorldName] = useState("");
  const [premise, setPremise] = useState("");
  const [tone, setTone] = useState("mythic");
  const [victoryStyle, setVictoryStyle] = useState("story");
  const [factions, setFactions] = useState<string[]>([""]);
  const [playerName, setPlayerName] = useState(defaultPlayerName);
  const [creating, setCreating] = useState(false);

  const addFaction = () => { if (factions.length < 6) setFactions([...factions, ""]); };
  const removeFaction = (i: number) => setFactions(factions.filter((_, idx) => idx !== i));
  const updateFaction = (i: number, v: string) => {
    const n = [...factions]; n[i] = v; setFactions(n);
  };

  const handleCreate = async () => {
    if (!worldName.trim() || !premise.trim()) { toast.error("Vyplňte název a premisu světa"); return; }
    if (!playerName.trim()) { toast.error("Zadejte jméno hráče"); return; }
    setCreating(true);

    try {
      const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();

      // Create game session
      const { data: session, error: sessErr } = await supabase.from("game_sessions").insert({
        room_code: roomCode,
        player1_name: playerName.trim(),
        max_players: 6,
        created_by: userId,
      } as any).select().single();

      if (sessErr || !session) throw sessErr || new Error("Failed to create session");

      // Create world foundation
      await supabase.from("world_foundations").insert({
        session_id: session.id,
        world_name: worldName.trim(),
        premise: premise.trim(),
        tone,
        victory_style: victoryStyle,
        initial_factions: factions.filter(f => f.trim()),
        created_by: userId,
      } as any);

      // Create game_players entry
      await supabase.from("game_players").insert({
        session_id: session.id,
        player_name: playerName.trim(),
        player_number: 1,
        user_id: userId,
      } as any);

      // Create membership (admin)
      await supabase.from("game_memberships").insert({
        user_id: userId,
        session_id: session.id,
        player_name: playerName.trim(),
        role: "admin",
      } as any);

      // Init resources
      for (const rt of ["food", "wood", "stone", "iron", "wealth"]) {
        await supabase.from("player_resources").insert({
          session_id: session.id,
          player_name: playerName.trim(),
          resource_type: rt,
          income: rt === "food" ? 4 : rt === "wood" ? 3 : rt === "stone" ? 2 : rt === "iron" ? 1 : 2,
          upkeep: rt === "food" ? 2 : rt === "wood" ? 1 : rt === "wealth" ? 1 : 0,
          stockpile: rt === "food" ? 10 : rt === "wood" ? 5 : rt === "stone" ? 3 : rt === "iron" ? 2 : 5,
        });
      }

      toast.success(`Svět „${worldName}" vytvořen!`);
      onCreated(session.id);
    } catch (err: any) {
      console.error(err);
      toast.error("Vytvoření hry selhalo");
    }
    setCreating(false);
  };

  return (
    <div className="bg-card p-5 rounded-lg border border-border shadow-parchment space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-lg flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" />
          Založit nový svět ({step}/4)
        </h3>
        <Button variant="ghost" size="icon" onClick={onCancel}><X className="h-4 w-4" /></Button>
      </div>

      {step === 1 && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Vaše jméno v této hře</Label>
            <Input value={playerName} onChange={e => setPlayerName(e.target.value)} placeholder="Jméno civilizace / hráče" />
          </div>
          <div className="space-y-2">
            <Label>Název světa</Label>
            <Input value={worldName} onChange={e => setWorldName(e.target.value)} placeholder="např. Archipelago Sardos" />
          </div>
          <div className="space-y-2">
            <Label>Premisa světa</Label>
            <Textarea value={premise} onChange={e => setPremise(e.target.value)} placeholder="Krátký popis světa, který AI bude používat jako základ pro narativ..." rows={3} />
          </div>
          <Button onClick={() => setStep(2)} disabled={!worldName.trim() || !premise.trim()} className="w-full">Další →</Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <Label>Tón vyprávění</Label>
          <div className="grid grid-cols-2 gap-2">
            {TONES.map(t => (
              <button key={t.value} onClick={() => setTone(t.value)}
                className={`p-3 rounded-lg border text-left text-sm transition-colors ${tone === t.value ? "border-primary bg-primary/10" : "border-border hover:border-primary/30"}`}>
                <div className="font-display font-semibold">{t.label}</div>
                <div className="text-xs text-muted-foreground">{t.desc}</div>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>← Zpět</Button>
            <Button onClick={() => setStep(3)} className="flex-1">Další →</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <Label>Styl vítězství</Label>
          <div className="space-y-2">
            {VICTORY_STYLES.map(v => (
              <button key={v.value} onClick={() => setVictoryStyle(v.value)}
                className={`w-full p-3 rounded-lg border text-left text-sm transition-colors ${victoryStyle === v.value ? "border-primary bg-primary/10" : "border-border hover:border-primary/30"}`}>
                <div className="font-display font-semibold">{v.label}</div>
                <div className="text-xs text-muted-foreground">{v.desc}</div>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(2)}>← Zpět</Button>
            <Button onClick={() => setStep(4)} className="flex-1">Další →</Button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3">
          <Label>Počáteční frakce / civilizace</Label>
          {factions.map((f, i) => (
            <div key={i} className="flex gap-2">
              <Input value={f} onChange={e => updateFaction(i, e.target.value)} placeholder={`Frakce ${i + 1}`} />
              {factions.length > 1 && (
                <Button variant="ghost" size="icon" onClick={() => removeFaction(i)}><X className="h-4 w-4" /></Button>
              )}
            </div>
          ))}
          {factions.length < 6 && (
            <Button variant="outline" size="sm" onClick={addFaction}><Plus className="h-3 w-3 mr-1" />Přidat frakci</Button>
          )}

          <div className="pt-2 space-y-2">
            <p className="text-xs text-muted-foreground">
              Shrnutí: <strong>{worldName}</strong> · {TONES.find(t => t.value === tone)?.label} · {VICTORY_STYLES.find(v => v.value === victoryStyle)?.label}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(3)}>← Zpět</Button>
              <Button onClick={handleCreate} disabled={creating} className="flex-1 font-display">
                <Sparkles className="mr-2 h-4 w-4" />
                {creating ? "Vytvářím svět..." : "⚔️ Založit svět"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorldSetupWizard;
