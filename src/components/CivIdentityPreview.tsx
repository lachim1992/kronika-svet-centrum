import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Sparkles, Wheat, TreePine, Mountain, Gem, Coins,
  Users, Heart, Shield, Swords, Zap, Castle, Building2, Handshake,
  TrendingUp, Crown, ArrowLeft, ArrowRight, AlertTriangle, ChevronDown, ChevronUp
} from "lucide-react";

interface CivIdentityData {
  display_name: string | null;
  flavor_summary: string | null;
  culture_tags: string[];
  urban_style: string;
  society_structure: string;
  military_doctrine: string;
  economic_focus: string;
  grain_modifier: number;
  wood_modifier: number;
  stone_modifier: number;
  iron_modifier: number;
  wealth_modifier: number;
  pop_growth_modifier: number;
  initial_burgher_ratio: number;
  initial_cleric_ratio: number;
  morale_modifier: number;
  mobilization_speed: number;
  cavalry_bonus: number;
  fortification_bonus: number;
  stability_modifier: number;
  trade_modifier: number;
  building_tags: string[];
  core_myth: string;
  cultural_quirk: string;
  architectural_style: string;
}

// Gameplay explanation for each modifier
const MODIFIER_SECTIONS = [
  {
    title: "Produkce zdrojů",
    icon: Wheat,
    description: "Multiplikativní bonusy/malusy aplikované na základní produkci vašich měst každé kolo.",
    items: [
      { key: "grain_modifier", label: "Obilí", icon: Wheat, format: (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`, desc: "Ovlivňuje produkci jídla → rychlost růstu populace a riziko hladomoru." },
      { key: "wood_modifier", label: "Dřevo", icon: TreePine, format: (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`, desc: "Ovlivňuje stavby, čluny, opevnění. Klíčové pro expanzi." },
      { key: "stone_modifier", label: "Kámen", icon: Mountain, format: (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`, desc: "Hradby, monumenty, divy světa. Základ fortifikace." },
      { key: "iron_modifier", label: "Železo", icon: Gem, format: (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`, desc: "Zbroj, zbraně, elitní jednotky. Bez železa nelze vybudovat silnou armádu." },
      { key: "wealth_modifier", label: "Bohatství", icon: Coins, format: (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`, desc: "Obchod, daně, žoldnéři. Klíčové pro diplomacii a nábor." },
    ],
  },
  {
    title: "Populace",
    icon: Users,
    description: "Ovlivňují růst a složení obyvatelstva vašich měst.",
    items: [
      { key: "pop_growth_modifier", label: "Růst populace", icon: Heart, format: (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`, desc: "Přidáno k základnímu růstu 1%/kolo. Větší populace = víc zdrojů, vojáků, vlivu." },
      { key: "initial_burgher_ratio", label: "Podíl měšťanů", icon: Building2, format: (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`, desc: "Měšťané generují bohatství a obchod. Zvýšení jejich podílu posílí ekonomiku." },
      { key: "initial_cleric_ratio", label: "Podíl duchovních", icon: Crown, format: (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`, desc: "Duchovní zvyšují stabilitu a legitimitu. Teokratické civilizace jich mají více." },
    ],
  },
  {
    title: "Vojenství",
    icon: Swords,
    description: "Bonusy k bojovým schopnostem vašich armád.",
    items: [
      { key: "morale_modifier", label: "Morálka", icon: Shield, format: (v: number) => `${v >= 0 ? "+" : ""}${v}`, desc: "Základní morálka jednotek. Vyšší morálka = méně dezercí, lepší výkon v bitvě." },
      { key: "mobilization_speed", label: "Rychlost mobilizace", icon: Zap, format: (v: number) => `×${v.toFixed(1)}`, desc: "Násobitel doby náboru. <1.0 = rychlejší, >1.0 = pomalejší stavba vojska." },
      { key: "cavalry_bonus", label: "Bonus kavalérie", icon: Swords, format: (v: number) => `+${Math.round(v * 100)}%`, desc: "Bonus k síle jízdních jednotek. Jezdecké národy dominují v otevřeném terénu." },
      { key: "fortification_bonus", label: "Fortifikace", icon: Castle, format: (v: number) => `+${Math.round(v * 100)}%`, desc: "Bonus k obraně měst. Stavitelé hradeb jsou těžko dobytí." },
    ],
  },
  {
    title: "Stabilita & Diplomacie",
    icon: Handshake,
    description: "Ovlivňují vnitřní stabilitu říše a diplomatický vliv.",
    items: [
      { key: "stability_modifier", label: "Stabilita", icon: Shield, format: (v: number) => `${v >= 0 ? "+" : ""}${v}`, desc: "Přidáno k základní stabilitě měst. Pod 30% hrozí rebelie! Nad 60% je bezpečno." },
      { key: "trade_modifier", label: "Obchod", icon: TrendingUp, format: (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`, desc: "Bonus k obchodnímu příjmu a diplomatickému vlivu z obchodu." },
    ],
  },
];

const STRUCTURE_LABELS: Record<string, Record<string, { label: string; desc: string }>> = {
  urban_style: {
    organic: { label: "🏘️ Organický", desc: "Města rostou přirozeně, levnější, ale méně efektivní." },
    planned: { label: "🏛️ Plánovaný", desc: "Organizovaná města s bonusy k produkci." },
    fortified: { label: "🏰 Opevněný", desc: "Města s přirozenou obranou, dražší stavby." },
    scattered: { label: "🏕️ Rozptýlený", desc: "Malé osady, rychlé založení, slabá obrana." },
    coastal: { label: "⚓ Pobřežní", desc: "Města u moře, bonus k obchodu a námořnictví." },
    underground: { label: "⛏️ Podzemní", desc: "Skrytá sídla, bonus ke kameni a obraně." },
  },
  society_structure: {
    tribal: { label: "🏕️ Kmenová", desc: "Rychlá mobilizace, nízká diplomacie." },
    hierarchical: { label: "👑 Hierarchická", desc: "Silná centralizace, bonusy k řádu." },
    egalitarian: { label: "⚖️ Rovnostářská", desc: "+8 diplomatický vliv, vyšší stabilita." },
    theocratic: { label: "⛪ Teokratická", desc: "+10 diplomatický vliv, více duchovních." },
    feudal: { label: "🏰 Feudální", desc: "+5 vojenský vliv, silná obrana." },
    mercantile: { label: "💰 Obchodnická", desc: "+15 obchod, +5 diplomacie." },
  },
  military_doctrine: {
    defensive: { label: "🛡️ Obranná", desc: "Silné hradby, pomalejší expanze." },
    offensive: { label: "⚔️ Útočná", desc: "+15 vojenský vliv, agresivní strategie." },
    guerrilla: { label: "🌿 Partyzánská", desc: "Bonus v lesích a horách, slabá v poli." },
    naval: { label: "⚓ Námořní", desc: "+5 vojenství, +10 obchod." },
    mercenary: { label: "💰 Žoldnéřská", desc: "+8 vojenství, +5 obchod." },
    conscript: { label: "📋 Branná povinnost", desc: "+10 vojenský vliv, rychlý nábor." },
  },
  economic_focus: {
    agrarian: { label: "🌾 Agrární", desc: "Stabilní růst, závislost na úrodě." },
    trade: { label: "🤝 Obchodní", desc: "+20 obchodní vliv, závislost na cestách." },
    mining: { label: "⛏️ Těžařská", desc: "+5 obchod, bonus ke kameni a železu." },
    crafting: { label: "🔨 Řemeslná", desc: "Bonus ke stavbám a speciálním budovám." },
    raiding: { label: "🏴 Nájezdnická", desc: "+10 vojenství, -5 diplomacie." },
    mixed: { label: "⚖️ Smíšená", desc: "Vyvážená ekonomika bez extrémů." },
  },
};

const TAG_LABELS: Record<string, string> = {
  discipline: "Disciplína", agriculture: "Zemědělství", seafaring: "Námořnictví",
  cavalry: "Jezdectví", mysticism: "Mystika", iron_working: "Kovářství",
  diplomacy: "Diplomacie", artisan: "Řemeslo", nomadic: "Nomádství",
  scholarly: "Učenost", warrior_culture: "Válečnictví", engineering: "Inženýrství",
  maritime_trade: "Námořní obchod", horse_lords: "Páni koní", mountain_folk: "Horský lid",
  forest_dwellers: "Lesní lid", desert_nomads: "Pouštní nomádi", river_culture: "Říční kultura",
};

interface Props {
  sessionId?: string;
  playerName: string;
  civDescription: string;
  identityData: CivIdentityData | null;
  loading: boolean;
  error: string | null;
  onExtract: () => void;
  onBack: () => void;
  onConfirm: () => void;
  /** If true, hides action buttons and shows as read-only summary */
  readOnly?: boolean;
}

const CivIdentityPreview = ({ sessionId, playerName, civDescription, identityData, loading, error, onExtract, onBack, onConfirm, readOnly }: Props) => {
  const [expandedSection, setExpandedSection] = useState<number | null>(null);

  if (loading) {
    return (
      <div className="space-y-4 text-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
        <p className="text-sm text-muted-foreground">AI analyzuje váš popis civilizace…</p>
        <p className="text-xs text-muted-foreground/60 italic">Extrahování modifikátorů, vlastností a narativního flavoru</p>
      </div>
    );
  }

  if (!identityData && !loading) {
    return (
      <div className="space-y-4">
        <div className="bg-muted/30 rounded-lg p-4 text-center space-y-3">
          <Sparkles className="h-6 w-6 text-primary mx-auto" />
          <p className="text-sm">Připraveno k AI analýze vaší civilizace</p>
          <p className="text-xs text-muted-foreground">
            AI analyzuje váš popis a vygeneruje kompletní sadu modifikátorů, vlastností a narativního pozadí.
          </p>
          {civDescription ? (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2 mt-2 text-left italic">
              „{civDescription.slice(0, 150)}{civDescription.length > 150 ? "…" : ""}"
            </div>
          ) : (
            <p className="text-xs text-amber-500 flex items-center justify-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Nezadali jste popis civilizace — modifikátory budou neutrální.
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Zpět</Button>
          <Button onClick={onExtract} className="flex-1">
            <Sparkles className="h-4 w-4 mr-2" />
            {civDescription ? "Analyzovat civilizaci" : "Pokračovat bez analýzy"}
          </Button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-center space-y-2">
          <AlertTriangle className="h-6 w-6 text-destructive mx-auto" />
          <p className="text-sm text-destructive">AI extrakce selhala</p>
          <p className="text-xs text-muted-foreground">{error}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Zpět</Button>
          <Button onClick={onExtract} variant="outline" className="flex-1">Zkusit znovu</Button>
          <Button onClick={onConfirm} className="flex-1">Pokračovat bez modifikátorů</Button>
        </div>
      </div>
    );
  }

  const d = identityData!;

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      {/* Identity header */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Crown className="h-5 w-5 text-primary" />
          <span className="font-display font-bold text-lg">{d.display_name || playerName}</span>
        </div>
        {d.flavor_summary && (
          <p className="text-sm italic text-muted-foreground">„{d.flavor_summary}"</p>
        )}
        {d.culture_tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {d.culture_tags.map(tag => (
              <Badge key={tag} variant="secondary" className="text-[10px]">
                {TAG_LABELS[tag] || tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Structural categories */}
      <div className="grid grid-cols-2 gap-2">
        {(["urban_style", "society_structure", "military_doctrine", "economic_focus"] as const).map(key => {
          const value = d[key];
          const info = STRUCTURE_LABELS[key]?.[value];
          const titles: Record<string, string> = {
            urban_style: "Urbanismus",
            society_structure: "Společnost",
            military_doctrine: "Vojenská doktrína",
            economic_focus: "Ekonomika",
          };
          return (
            <div key={key} className="bg-muted/30 rounded-lg p-2.5 space-y-0.5">
              <p className="text-[10px] text-muted-foreground font-display uppercase tracking-wider">{titles[key]}</p>
              <p className="text-sm font-semibold">{info?.label || value}</p>
              <p className="text-[10px] text-muted-foreground">{info?.desc}</p>
            </div>
          );
        })}
      </div>

      {/* Modifier sections */}
      {MODIFIER_SECTIONS.map((section, si) => {
        const SectionIcon = section.icon;
        const isExpanded = expandedSection === si;
        const hasNonZero = section.items.some(item => {
          const val = (d as any)[item.key];
          return val !== undefined && val !== 0 && val !== 1;
        });

        return (
          <div key={si} className="border border-border/50 rounded-lg overflow-hidden">
            <button
              onClick={() => setExpandedSection(isExpanded ? null : si)}
              className="w-full flex items-center gap-2 p-3 text-left hover:bg-muted/30 transition-colors"
            >
              <SectionIcon className="h-4 w-4 text-primary flex-shrink-0" />
              <span className="font-display font-semibold text-sm flex-1">{section.title}</span>
              {/* Quick badges for non-zero modifiers */}
              {!isExpanded && hasNonZero && (
                <div className="flex gap-1 flex-wrap justify-end">
                  {section.items.map(item => {
                    const val = (d as any)[item.key];
                    if (val === undefined || val === 0 || (item.key === "mobilization_speed" && val === 1)) return null;
                    const isPositive = item.key === "mobilization_speed" ? val < 1 : val > 0;
                    return (
                      <Badge key={item.key} variant="outline" className={`text-[9px] ${isPositive ? "text-green-600 border-green-600/30" : "text-red-500 border-red-500/30"}`}>
                        {item.label}: {item.format(val)}
                      </Badge>
                    );
                  })}
                </div>
              )}
              {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>

            {isExpanded && (
              <div className="px-3 pb-3 space-y-2 border-t border-border/30 pt-2">
                <p className="text-[10px] text-muted-foreground">{section.description}</p>
                {section.items.map(item => {
                  const val = (d as any)[item.key];
                  if (val === undefined) return null;
                  const ItemIcon = item.icon;
                  const isNeutral = val === 0 || (item.key === "mobilization_speed" && val === 1);
                  const isPositive = item.key === "mobilization_speed" ? val < 1 : val > 0;

                  return (
                    <div key={item.key} className="flex items-start gap-2">
                      <ItemIcon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${isNeutral ? "text-muted-foreground" : isPositive ? "text-green-600" : "text-red-500"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold">{item.label}</span>
                          <span className={`text-xs font-mono ${isNeutral ? "text-muted-foreground" : isPositive ? "text-green-600" : "text-red-500"}`}>
                            {item.format(val)}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground leading-tight">{item.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Special buildings */}
      {d.building_tags.length > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-1">
          <p className="text-xs font-display font-semibold flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-primary" />
            Speciální budovy (unikátní pro vaši civilizaci)
          </p>
          <div className="flex flex-wrap gap-1">
            {d.building_tags.map(tag => (
              <Badge key={tag} className="text-xs">{tag.replace(/_/g, " ")}</Badge>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">Tyto budovy jsou dostupné pouze vaší civilizaci a poskytují unikátní výhody.</p>
        </div>
      )}

      {/* Narrative flavor */}
      <div className="space-y-2">
        <p className="text-xs font-display font-semibold">Narativní pozadí (generováno AI):</p>
        {d.core_myth && (
          <div className="bg-muted/30 rounded p-2.5 space-y-0.5">
            <p className="text-[10px] text-muted-foreground font-display uppercase">📜 Zakládající mýtus</p>
            <p className="text-xs italic">{d.core_myth}</p>
            <p className="text-[9px] text-muted-foreground">→ Ovlivňuje legitimitu vládce. Činy v souladu s mýtem ji zvyšují.</p>
          </div>
        )}
        {d.cultural_quirk && (
          <div className="bg-muted/30 rounded p-2.5 space-y-0.5">
            <p className="text-[10px] text-muted-foreground font-display uppercase">🎭 Kulturní zvláštnost</p>
            <p className="text-xs italic">{d.cultural_quirk}</p>
            <p className="text-[9px] text-muted-foreground">→ Projevuje se v AI generovaných kronikách, radách a zvěstech.</p>
          </div>
        )}
        {d.architectural_style && (
          <div className="bg-muted/30 rounded p-2.5 space-y-0.5">
            <p className="text-[10px] text-muted-foreground font-display uppercase">🏛️ Architektonický styl</p>
            <p className="text-xs italic">{d.architectural_style}</p>
            <p className="text-[9px] text-muted-foreground">→ Ovlivňuje generování budov a vizuální popis měst.</p>
          </div>
        )}
      </div>

      {/* Influence impact summary */}
      <div className="bg-accent/10 border border-accent/20 rounded-lg p-3 space-y-1">
        <p className="text-xs font-display font-semibold">📊 Dopad na Vliv (Influence):</p>
        <div className="text-[10px] text-muted-foreground space-y-0.5">
          {d.trade_modifier !== 0 && <p>• Obchod: {d.trade_modifier > 0 ? "+" : ""}{Math.round(d.trade_modifier * 100)} bodů vlivu</p>}
          {d.military_doctrine === "offensive" && <p>• Vojenství: +15 bodů (útočná doktrína)</p>}
          {d.military_doctrine === "conscript" && <p>• Vojenství: +10 bodů (branná povinnost)</p>}
          {d.military_doctrine === "naval" && <p>• Vojenství: +5 / Obchod: +10 (námořní)</p>}
          {d.society_structure === "mercantile" && <p>• Obchod: +15 / Diplomacie: +5 (obchodnická společnost)</p>}
          {d.society_structure === "theocratic" && <p>• Diplomacie: +10 (teokratická společnost)</p>}
          {d.society_structure === "egalitarian" && <p>• Diplomacie: +8 (rovnostářská společnost)</p>}
          {d.society_structure === "feudal" && <p>• Vojenství: +5 (feudální společnost)</p>}
          {d.economic_focus === "trade" && <p>• Obchod: +20 (obchodní zaměření)</p>}
          {d.economic_focus === "raiding" && <p>• Vojenství: +10 / Diplomacie: -5 (nájezdníci)</p>}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2 sticky bottom-0 bg-card pb-1">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Upravit popis
        </Button>
        <Button onClick={onConfirm} className="flex-1 font-display">
          <ArrowRight className="h-4 w-4 mr-2" /> Potvrdit a založit svět
        </Button>
      </div>
    </div>
  );
};

export default CivIdentityPreview;
