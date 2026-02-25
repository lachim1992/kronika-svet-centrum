import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Crown, Save, Sparkles, Shield, Swords, TrendingUp, Heart, Handshake, Building2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

// ── Civ bonus derivation (mirrored from physics.ts for client display) ──
const QUIRK_BONUS_POOL = [
  { key: "stability_modifier", value: 5, keywords: ["shromáždění", "rada", "moudrost", "tradice", "řád"], label: "Stabilita", icon: Shield },
  { key: "diplomacy_modifier", value: 8, keywords: ["obchod", "vyjednávání", "diplomacie", "smír", "mír"], label: "Diplomacie", icon: Handshake },
  { key: "trade_modifier", value: 0.1, keywords: ["trh", "kupec", "zlato", "bohatství", "prosperita"], label: "Obchod", icon: TrendingUp },
  { key: "growth_modifier", value: 0.005, keywords: ["plodnost", "rodina", "přírůstek", "osídlení", "lid"], label: "Růst", icon: Heart },
  { key: "morale_modifier", value: 5, keywords: ["odvaha", "válečník", "čest", "sláva", "boj"], label: "Morálka", icon: Swords },
];
const ARCH_BONUS_POOL = [
  { key: "fortification_bonus", value: 0.1, keywords: ["hradby", "věže", "pevnost", "obrana", "robustní"], label: "Fortifikace", icon: Shield },
  { key: "build_speed_modifier", value: -0.15, keywords: ["rychl", "lehk", "dřev", "jednoduch", "funkční"], label: "Rychlost stavby", icon: Building2 },
  { key: "stability_modifier", value: 3, keywords: ["chrám", "katedrál", "posvát", "víra", "mramor"], label: "Stabilita", icon: Shield },
  { key: "trade_modifier", value: 0.08, keywords: ["přístav", "most", "cest", "bráně", "tržiště"], label: "Obchod", icon: TrendingUp },
];
const MYTH_BONUS_POOL = [
  { key: "legitimacy_base", value: 10, keywords: ["král", "dynastie", "dědic", "koruna", "právo"], label: "Legitimita", icon: Crown },
  { key: "morale_modifier", value: 5, keywords: ["vytrvalost", "síla", "přežití", "oheň", "krev"], label: "Morálka", icon: Swords },
  { key: "growth_modifier", value: 0.003, keywords: ["země", "úroda", "požehnání", "bohové", "příroda"], label: "Růst", icon: Heart },
  { key: "diplomacy_modifier", value: 5, keywords: ["jednota", "spojenectví", "spravedlnost", "zákon", "smlouva"], label: "Diplomacie", icon: Handshake },
  { key: "stability_modifier", value: 4, keywords: ["rozhodnutí", "moudrost", "stopa", "postupn", "vytrval"], label: "Stabilita", icon: Shield },
];

function deriveBonuses(coreMíth: string | null, quirk: string | null, archStyle: string | null): Record<string, number> {
  const bonuses: Record<string, number> = {};
  function applyPool(text: string | null, pool: typeof QUIRK_BONUS_POOL) {
    if (!text) return;
    const lower = text.toLowerCase();
    let matched = false;
    for (const entry of pool) {
      if (entry.keywords.some(kw => lower.includes(kw))) {
        bonuses[entry.key] = (bonuses[entry.key] || 0) + entry.value;
        matched = true;
      }
    }
    if (!matched && text.length > 0) {
      let h = 0;
      for (let i = 0; i < text.length; i++) h = ((h << 5) - h + text.charCodeAt(i)) | 0;
      const idx = Math.abs(h) % pool.length;
      bonuses[pool[idx].key] = (bonuses[pool[idx].key] || 0) + pool[idx].value;
    }
  }
  applyPool(quirk, QUIRK_BONUS_POOL);
  applyPool(archStyle, ARCH_BONUS_POOL);
  applyPool(coreMíth, MYTH_BONUS_POOL);
  return bonuses;
}

const BONUS_LABELS: Record<string, { label: string; format: (v: number) => string }> = {
  stability_modifier: { label: "Stabilita", format: v => `+${v}` },
  diplomacy_modifier: { label: "Diplomacie", format: v => `+${v}` },
  trade_modifier: { label: "Obchod", format: v => `+${Math.round(v * 100)}%` },
  growth_modifier: { label: "Růst populace", format: v => `+${(v * 100).toFixed(1)}%` },
  morale_modifier: { label: "Morálka vojsk", format: v => `+${v}` },
  fortification_bonus: { label: "Fortifikace", format: v => `+${Math.round(v * 100)}%` },
  build_speed_modifier: { label: "Rychlost stavby", format: v => `${Math.round(v * 100)}%` },
  legitimacy_base: { label: "Legitimita", format: v => `+${v}` },
};

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

  // Live preview of bonuses
  const previewBonuses = deriveBonuses(coreMíto, quirk, archStyle);

  const handleSave = async () => {
    if (!civName.trim()) { toast.error("Zadejte název civilizace"); return; }
    setSaving(true);

    const bonuses = deriveBonuses(coreMíto, quirk, archStyle);

    if (myCiv) {
      await supabase.from("civilizations").update({
        civ_name: civName, core_myth: coreMíto || null,
        cultural_quirk: quirk || null, architectural_style: archStyle || null,
        civ_bonuses: bonuses,
      }).eq("id", myCiv.id);
    } else {
      await supabase.from("civilizations").insert({
        session_id: sessionId, player_name: playerName, civ_name: civName,
        core_myth: coreMíto || null, cultural_quirk: quirk || null,
        architectural_style: archStyle || null,
        civ_bonuses: bonuses,
      });
    }
    toast.success("Civilizace uložena — bonusy přepočítány");
    onRefetch?.();
    setSaving(false);
  };

  const otherCivs = civilizations.filter((c: any) => c.player_name !== playerName);

  return (
    <div className="space-y-6 px-4">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-decorative font-bold flex items-center justify-center gap-3">
          <Crown className="h-7 w-7 text-illuminated" />
          Identita civilizace
        </h1>
        <p className="text-sm text-muted-foreground">Definujte DNA vašeho národa — každý detail ovlivňuje herní mechaniky</p>
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
            <Textarea value={coreMíto} onChange={e => setCoreMíto(e.target.value)} placeholder="Příběh o vzniku vašeho lidu... Ovlivňuje legitimitu." rows={2} className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-display text-muted-foreground">Kulturní zvláštnost</label>
            <Input value={quirk} onChange={e => setQuirk(e.target.value)} placeholder="např. Tiché shromáždění → bonus ke stabilitě" className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-display text-muted-foreground">Architektonický styl</label>
            <Input value={archStyle} onChange={e => setArchStyle(e.target.value)} placeholder="např. Robustní, funkční → rychlost stavby" className="mt-1" />
          </div>
        </div>

        {/* Live bonus preview */}
        {Object.keys(previewBonuses).length > 0 && (
          <div className="border border-border/50 rounded-lg p-3 bg-muted/30 space-y-2">
            <p className="text-xs font-display text-muted-foreground font-semibold">Odvozené bonusy z DNA:</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(previewBonuses).map(([key, value]) => {
                const info = BONUS_LABELS[key];
                if (!info) return null;
                return (
                  <Badge key={key} variant="secondary" className="text-xs gap-1">
                    {info.label}: {info.format(value)}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}

        <Button onClick={handleSave} disabled={saving} className="w-full h-11 font-display">
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Ukládám..." : myCiv ? "Aktualizovat civilizaci" : "Založit civilizaci"}
        </Button>
      </div>

      {otherCivs.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-display font-semibold text-sm">Ostatní civilizace</h3>
          {otherCivs.map((c: any) => {
            const otherBonuses = (c.civ_bonuses as Record<string, number>) || {};
            return (
              <div key={c.id} className="manuscript-card p-4 space-y-2">
                <p className="font-display font-bold text-sm">{c.civ_name} <span className="text-muted-foreground font-normal">({c.player_name})</span></p>
                {c.core_myth && <p className="text-xs text-muted-foreground italic">📜 {c.core_myth}</p>}
                {c.cultural_quirk && <p className="text-xs text-muted-foreground">🎭 {c.cultural_quirk}</p>}
                {c.architectural_style && <p className="text-xs text-muted-foreground">🏛️ {c.architectural_style}</p>}
                {Object.keys(otherBonuses).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(otherBonuses).map(([key, value]) => {
                      const info = BONUS_LABELS[key];
                      if (!info) return null;
                      return <Badge key={key} variant="outline" className="text-xs">{info.label}: {info.format(value)}</Badge>;
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CivilizationDNA;
