import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Crown, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface CivilizationDNAProps {
  sessionId: string;
  playerName: string;
  civilizations: any[];
  onRefetch?: () => void;
}

const CivilizationDNA = ({ sessionId, playerName, civilizations, onRefetch }: CivilizationDNAProps) => {
  const myCiv = civilizations.find((c: any) => c.player_name === playerName);
  const [civName, setCivName] = useState(myCiv?.civ_name || "");
  const [coreMíto, setCoreMíto] = useState(myCiv?.core_myth || "");
  const [quirk, setQuirk] = useState(myCiv?.cultural_quirk || "");
  const [archStyle, setArchStyle] = useState(myCiv?.architectural_style || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (myCiv) {
      setCivName(myCiv.civ_name || "");
      setCoreMíto(myCiv.core_myth || "");
      setQuirk(myCiv.cultural_quirk || "");
      setArchStyle(myCiv.architectural_style || "");
    }
  }, [myCiv]);

  const handleSave = async () => {
    if (!civName.trim()) { toast.error("Zadejte název civilizace"); return; }
    setSaving(true);
    if (myCiv) {
      await supabase.from("civilizations").update({
        civ_name: civName, core_myth: coreMíto || null,
        cultural_quirk: quirk || null, architectural_style: archStyle || null,
      }).eq("id", myCiv.id);
    } else {
      await supabase.from("civilizations").insert({
        session_id: sessionId, player_name: playerName, civ_name: civName,
        core_myth: coreMíto || null, cultural_quirk: quirk || null,
        architectural_style: archStyle || null,
      });
    }
    toast.success("Civilizace uložena");
    onRefetch?.();
    setSaving(false);
  };

  // Show other players' civilizations
  const otherCivs = civilizations.filter((c: any) => c.player_name !== playerName);

  return (
    <div className="space-y-6 px-4">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-decorative font-bold flex items-center justify-center gap-3">
          <Crown className="h-7 w-7 text-illuminated" />
          Identita civilizace
        </h1>
        <p className="text-sm text-muted-foreground">Definujte DNA vašeho národa</p>
      </div>

      <div className="manuscript-card p-5 space-y-4">
        <h3 className="font-display font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-illuminated" />
          Vaše civilizace — {playerName}
        </h3>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-display text-muted-foreground">Název národa</label>
            <Input value={civName} onChange={e => setCivName(e.target.value)} placeholder="např. Kapkianové" className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-display text-muted-foreground">Zakladatelský mýtus</label>
            <Textarea value={coreMíto} onChange={e => setCoreMíto(e.target.value)} placeholder="Příběh o vzniku vašeho lidu..." rows={2} className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-display text-muted-foreground">Kulturní zvláštnost</label>
            <Input value={quirk} onChange={e => setQuirk(e.target.value)} placeholder="např. Milovníci rohového nástroje" className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-display text-muted-foreground">Architektonický styl</label>
            <Input value={archStyle} onChange={e => setArchStyle(e.target.value)} placeholder="např. Růžový mramor, klenuté oblouky" className="mt-1" />
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full h-11 font-display">
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Ukládám..." : myCiv ? "Aktualizovat civilizaci" : "Založit civilizaci"}
        </Button>
      </div>

      {otherCivs.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-display font-semibold text-sm">Ostatní civilizace</h3>
          {otherCivs.map((c: any) => (
            <div key={c.id} className="manuscript-card p-4 space-y-1">
              <p className="font-display font-bold text-sm">{c.civ_name} <span className="text-muted-foreground font-normal">({c.player_name})</span></p>
              {c.core_myth && <p className="text-xs text-muted-foreground italic">📜 {c.core_myth}</p>}
              {c.cultural_quirk && <p className="text-xs text-muted-foreground">🎭 {c.cultural_quirk}</p>}
              {c.architectural_style && <p className="text-xs text-muted-foreground">🏛️ {c.architectural_style}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CivilizationDNA;
