// CivSetupStep — single-player & manual mód: identita říše, vládce, vláda,
// heraldika, zakladatelská legenda a tajný cíl. Reuse komponent z MP lobby.
//
// V multiplayeru tyto kroky řeší MultiplayerLobby (per hráč) — tato komponenta
// je výhradně pro WorldSetupWizard, kdy hostuje single-player nebo manual mód.

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Crown, Castle, Landmark, Shield, BookOpen, Target, Compass, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import RulerStep, { type RulerData } from "@/components/multiplayer-lobby/RulerStep";
import GovernmentFaithStep, { type GovernmentFaithData } from "@/components/multiplayer-lobby/GovernmentFaithStep";
import SecretObjectiveStep, { type SecretObjectiveData } from "@/components/multiplayer-lobby/SecretObjectiveStep";
import HeraldryPicker, { type HeraldryData } from "@/components/multiplayer-lobby/HeraldryPicker";
import SpawnPreferencePicker from "@/components/multiplayer-lobby/SpawnPreferencePicker";

import type { WorldIdentityInput } from "@/types/worldBootstrap";

const BIOMES = [
  { value: "plains", label: "🌾 Pláně" },
  { value: "coast", label: "🌊 Pobřeží" },
  { value: "mountains", label: "⛰️ Hory" },
  { value: "forest", label: "🌲 Les" },
  { value: "desert", label: "🏜️ Poušť" },
  { value: "tundra", label: "❄️ Tundra" },
  { value: "volcanic", label: "🌋 Vulkán" },
];

interface Props {
  value: WorldIdentityInput;
  onChange: (next: WorldIdentityInput) => void;
  /** Premise se použije jako fallback context pro AI extrakci. */
  premise: string;
  disabled?: boolean;
}

const CivSetupStep = ({ value, onChange, premise, disabled }: Props) => {
  const [identityOpen, setIdentityOpen] = useState(true);
  const [rulerOpen, setRulerOpen] = useState(true);
  const [homelandOpen, setHomelandOpen] = useState(false);
  const [govOpen, setGovOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [secretOpen, setSecretOpen] = useState(false);

  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<any | null>(null);

  const heraldry: HeraldryData = value.heraldry || { primary: "#2563eb", secondary: "#fef08a", symbol: "circle" };
  const ruler: RulerData = {
    ruler_name: value.rulerName || "",
    ruler_title: value.rulerTitle || "",
    ruler_archetype: value.rulerArchetype || "",
    ruler_bio: value.rulerBio || "",
  };
  const gov: GovernmentFaithData = {
    government_form: value.governmentForm || "",
    trade_ideology: value.tradeIdeology || "",
    dominant_faith: value.dominantFaith || "",
    faith_attitude: value.faithAttitude || "tolerant",
  };
  const secret: SecretObjectiveData = {
    secret_objective_archetype: value.secretObjectiveArchetype || "",
  };

  const update = (patch: Partial<WorldIdentityInput>) => onChange({ ...value, ...patch });

  async function handleExtractIdentity() {
    const desc = (value.civDescription || "").trim();
    if (desc.length < 30) {
      toast.error("Napiš krátký popis civilizace (min. 30 znaků), aby AI měla z čeho vycházet.");
      return;
    }
    setExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke("extract-civ-identity", {
        body: {
          description: desc,
          context: { premise, realm_name: value.realmName, ruler_name: value.rulerName },
        },
      });
      if (error) throw error;
      setExtracted(data);
      toast.success("Identita extrahována");
    } catch (e: any) {
      toast.error(e?.message || "Extrakce selhala");
    } finally {
      setExtracting(false);
    }
  }

  return (
    <Card className="p-3 sm:p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Tvá civilizace</h2>
      </div>
      <p className="text-xs text-muted-foreground -mt-1">
        Pojmenuj svou říši, vládce a zvol tajný cíl. Vše se vetká do prehistorie a Chronicle Zero.
      </p>

      {/* IDENTITA */}
      <Collapsible open={identityOpen} onOpenChange={setIdentityOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full text-left p-2 rounded hover:bg-muted/50">
          {identityOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <Castle className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold flex-1">Identita říše</span>
          {value.realmName && <span className="text-[10px] text-muted-foreground truncate max-w-[40%]">{value.realmName} · {value.settlementName}</span>}
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-2 pl-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Jméno říše *</Label>
              <Input value={value.realmName || ""} onChange={(e) => update({ realmName: e.target.value })} placeholder="např. Aurelské království" disabled={disabled} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hlavní sídlo *</Label>
              <Input value={value.settlementName || ""} onChange={(e) => update({ settlementName: e.target.value })} placeholder="např. Stříbrohrad" disabled={disabled} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Lid (etnonym)</Label>
              <Input value={value.peopleName || ""} onChange={(e) => update({ peopleName: e.target.value })} placeholder="např. Aurelové" disabled={disabled} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Kultura</Label>
              <Input value={value.cultureName || ""} onChange={(e) => update({ cultureName: e.target.value })} placeholder="např. Severský kult Slunce" disabled={disabled} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Jazyk</Label>
              <Input value={value.languageName || ""} onChange={(e) => update({ languageName: e.target.value })} placeholder="např. Aurelština" disabled={disabled} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Popis civilizace (pro AI extrakci modifikátorů)</Label>
            <Textarea
              value={value.civDescription || ""}
              onChange={(e) => update({ civDescription: e.target.value })}
              placeholder="Národ horalů, kteří uctívají sněžné vlky a žijí z lovu a hutnictví železa. Neznají písmo, ale jejich runové kameny..."
              rows={3}
              maxLength={800}
              disabled={disabled}
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] text-muted-foreground">{(value.civDescription || "").length}/800</p>
              <Button type="button" size="sm" variant="outline" onClick={handleExtractIdentity} disabled={disabled || extracting} className="h-7 text-[10px]">
                {extracting ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Analyzuji…</> : <>✨ Extrahovat modifikátory</>}
              </Button>
            </div>
          </div>
          {extracted && (
            <div className="border border-primary/30 rounded p-2 bg-primary/5 space-y-1">
              <p className="text-[11px] font-semibold text-primary">{extracted.display_name || "Frakce"}</p>
              {extracted.flavor_summary && <p className="text-[10px] text-muted-foreground italic">{extracted.flavor_summary}</p>}
              <div className="flex flex-wrap gap-1 pt-1">
                {extracted.urban_style && <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted">🏛️ {extracted.urban_style}</span>}
                {extracted.society_structure && <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted">👥 {extracted.society_structure}</span>}
                {extracted.military_doctrine && <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted">⚔️ {extracted.military_doctrine}</span>}
                {extracted.economic_focus && <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted">💰 {extracted.economic_focus}</span>}
              </div>
            </div>
          )}
          <HeraldryPicker value={heraldry} onChange={(h) => update({ heraldry: h })} />
        </CollapsibleContent>
      </Collapsible>

      {/* VLÁDCE */}
      <Collapsible open={rulerOpen} onOpenChange={setRulerOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full text-left p-2 rounded hover:bg-muted/50">
          {rulerOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <Crown className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold flex-1">Vládce *</span>
          {value.rulerName && <span className="text-[10px] text-muted-foreground truncate max-w-[40%]">{value.rulerTitle} {value.rulerName}</span>}
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2 pl-2">
          <RulerStep value={ruler} onChange={(r) => update({ rulerName: r.ruler_name, rulerTitle: r.ruler_title, rulerArchetype: r.ruler_archetype, rulerBio: r.ruler_bio })} />
        </CollapsibleContent>
      </Collapsible>

      {/* DOMOVINA */}
      <Collapsible open={homelandOpen} onOpenChange={setHomelandOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full text-left p-2 rounded hover:bg-muted/50">
          {homelandOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <Compass className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold flex-1">Domovina (volitelné)</span>
          {value.homelandBiome && <span className="text-[10px] text-muted-foreground">{BIOMES.find(b => b.value === value.homelandBiome)?.label}</span>}
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-2 pl-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Název domoviny</Label>
              <Input value={value.homelandName || ""} onChange={(e) => update({ homelandName: e.target.value })} placeholder="např. Severní step" disabled={disabled} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Biom</Label>
              <select className="w-full h-9 px-2 rounded border border-input bg-background text-xs" value={value.homelandBiome || ""} onChange={(e) => update({ homelandBiome: e.target.value })} disabled={disabled}>
                <option value="">— vyber —</option>
                {BIOMES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Popis domoviny</Label>
            <Textarea value={value.homelandDesc || ""} onChange={(e) => update({ homelandDesc: e.target.value })} placeholder="Krátký popis krajiny, klimatu a vzhledu domoviny..." rows={2} maxLength={400} disabled={disabled} />
          </div>
          <SpawnPreferencePicker value={value.spawnPreference || "any"} onChange={(v) => update({ spawnPreference: v })} />
        </CollapsibleContent>
      </Collapsible>

      {/* VLÁDA & VÍRA */}
      <Collapsible open={govOpen} onOpenChange={setGovOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full text-left p-2 rounded hover:bg-muted/50">
          {govOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <Landmark className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold flex-1">Vláda, ekonomika & víra (volitelné)</span>
          {value.governmentForm && <span className="text-[10px] text-muted-foreground">{value.governmentForm}</span>}
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2 pl-2">
          <GovernmentFaithStep value={gov} onChange={(g) => update({ governmentForm: g.government_form, tradeIdeology: g.trade_ideology, dominantFaith: g.dominant_faith, faithAttitude: g.faith_attitude })} />
        </CollapsibleContent>
      </Collapsible>

      {/* ZAKLADATELSKÁ LEGENDA */}
      <Collapsible open={legendOpen} onOpenChange={setLegendOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full text-left p-2 rounded hover:bg-muted/50">
          {legendOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <BookOpen className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold flex-1">Zakladatelská legenda (volitelné)</span>
          {value.foundingLegend && <span className="text-[10px] text-muted-foreground">{(value.foundingLegend || "").slice(0, 30)}…</span>}
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-2 pl-2">
          <p className="text-[11px] text-muted-foreground">
            Jak vznikla naše říše? Kdo byl první vládce? Jaký skutek založil tradici? Tento text se vetká do prehistorie a Chronicle Zero.
          </p>
          <Textarea
            value={value.foundingLegend || ""}
            onChange={(e) => update({ foundingLegend: e.target.value })}
            placeholder="Když Theron Sjednotitel zvedl meč nad mrtvolou posledního orčího chána, nebe se rozdělilo a sníh padal sedm dní. Toho dne se zrodil náš lid..."
            rows={4}
            maxLength={800}
            disabled={disabled}
          />
          <p className="text-[10px] text-muted-foreground">{(value.foundingLegend || "").length}/800</p>
        </CollapsibleContent>
      </Collapsible>

      {/* TAJNÝ CÍL */}
      <Collapsible open={secretOpen} onOpenChange={setSecretOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full text-left p-2 rounded hover:bg-muted/50">
          {secretOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <Target className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold flex-1">Tajný cíl *</span>
          {value.secretObjectiveArchetype && <span className="text-[10px] text-muted-foreground">{value.secretObjectiveArchetype}</span>}
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2 pl-2">
          <SecretObjectiveStep value={secret} onChange={(s) => update({ secretObjectiveArchetype: s.secret_objective_archetype })} />
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default CivSetupStep;
