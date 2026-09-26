import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { dispatchCommand } from "@/lib/commands";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { ArrowUp, Building2, Clock, Coins, Hammer, Loader2, Sparkles, Users } from "lucide-react";
import { DEMAND_BASKETS, getBasketMeta, inspectBasketOutputs, scaledBasketOutputs } from "@/lib/goodsCatalog";
import { useManagementReport } from "@/hooks/useManagementReport";

/** Honest reasons a structure makes nothing this turn. */
const BLOCKED_REASON: Record<string, string> = {
  no_workers: "chybí pracovníci", missing_inputs: "vstupy nikde nejsou",
  missing_input_route: "vstupy existují, chybí cesta", missing_inputs_or_route: "chybí vstupy nebo cesta",
  missing_local_delivery_route: "chybí cesta do města", missing_recipe_inputs: "chybí zadané vstupy",
  capacity_labor_or_staffing: "chybí kapacita nebo lidé",
};

/** Human labels for the flat effect keys buildings and templates carry. */
const EFFECT_LABELS: Record<string, string> = {
  food_income: "🌾 Obilí", production_income: "⚒️ Produkce",
  wood_income: "⚒️ Produkce", stone_income: "⚒️ Produkce", iron_income: "⚒️ Produkce",
  grain_production: "🌾 Obilí", wood_production: "⚒️ Produkce",
  stone_production: "⚒️ Produkce", iron_production: "⚒️ Produkce",
  wealth_income: "💰 Bohatství", faith_income: "⛪ Víra",
  stability_bonus: "🛡️ Stabilita", influence_bonus: "👑 Vliv",
  population_growth: "👥 Růst populace", manpower_bonus: "⚔️ Branná síla",
  defense_bonus: "🏰 Obrana", wealth: "💰 Zlato", stability: "🛡️ Stabilita",
  influence: "👑 Vliv", defense: "🏰 Obrana", recruitment: "⚔️ Rekrutace",
  military_quality: "🗡️ Kvalita vojsk", military_garrison: "🛡️ Posádka",
  morale_bonus: "💪 Morálka", trade_bonus: "📦 Obchod", granary_capacity: "🏺 Sýpka",
  population_capacity: "🏠 Kapacita", legitimacy: "⚖️ Legitimita",
  cleric_attraction: "✝️ Duchovní", burgher_attraction: "🏘️ Měšťané",
  disease_resistance: "💊 Zdraví", siege_power: "🪨 Obléhání",
  siege_resistance: "🏰 Odolnost", build_speed: "⏱️ Rychlost stavby",
  famine_resistance: "🌾 Odolnost hladu", cavalry_bonus: "🐴 Jízda",
  ranged_bonus: "🏹 Střelci", mobility: "🏃 Mobilita", vision: "👁️ Výhled",
  espionage_defense: "🕵️ Kontrašpionáž", recruitment_bonus: "⚔️ Rekrutace+",
  special_production: "✨ Speciální", naval_power: "⚓ Námořní síla", research: "📚 Výzkum",
};

const CATEGORY_LABEL: Record<string, string> = {
  economic: "Ekonomická", military: "Vojenská", cultural: "Kulturní",
  infrastructure: "Infrastruktura", religious: "Sakrální", trade: "Obchodní",
  residential: "Obytná", production: "Produkční", administrative: "Správní",
};

/** Effects worth showing as "what it does" — skips structural keys. */
const HIDDEN_EFFECT_KEYS = new Set(["basket_outputs", "capability_tags", "tags"]);

export type BuildingTarget = { type: "building" | "district"; id: string };

interface Props {
  sessionId: string;
  currentTurn: number;
  playerName: string;
  isOwner: boolean;
  treasury: { gold: number; production: number };
  target: BuildingTarget | null;
  onClose: () => void;
  onChanged?: () => void;
}

const num = (value: any) => Number(value || 0);
const fmt = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

const BuildingDetailSheet = ({
  sessionId, currentTurn, playerName, isOwner, treasury, target, onClose, onChanged,
}: Props) => {
  const [loading, setLoading] = useState(false);
  const [entity, setEntity] = useState<any>(null);
  const [template, setTemplate] = useState<any>(null);
  const [city, setCity] = useState<any>(null);
  const [baskets, setBaskets] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const isDistrict = target?.type === "district";

  const fetchData = useCallback(async () => {
    if (!target) return;
    setLoading(true);
    const entityRes = isDistrict
      ? await supabase.from("city_districts").select("*").eq("id", target.id).maybeSingle()
      : await supabase.from("city_buildings").select("*, building_templates ( * )").eq("id", target.id).maybeSingle();
    const row: any = entityRes.data;
    setEntity(row || null);
    setTemplate(row?.building_templates || null);
    if (row?.city_id) {
      const [cityRes, basketRes] = await Promise.all([
        supabase.from("cities").select("id, name, owner_player, settlement_level, population_total").eq("id", row.city_id).maybeSingle(),
        supabase.from("city_market_baskets")
          .select("basket_key, local_demand, local_supply, auto_supply, recipe_bonus, building_bonus, bonus_supply, unmet_demand, export_surplus, domestic_satisfaction, turn_number")
          .eq("session_id", sessionId).eq("city_id", row.city_id)
          .order("turn_number", { ascending: false }).limit(60),
      ]);
      setCity(cityRes.data || null);
      const rows = basketRes.data || [];
      const latestTurn = rows.reduce((max: number, item: any) => Math.max(max, num(item.turn_number)), 0);
      setBaskets(rows.filter((item: any) => num(item.turn_number) === latestTurn));
    } else {
      setCity(null); setBaskets([]);
    }
    setLoading(false);
  }, [target, isDistrict, sessionId]);

  useEffect(() => { if (target) void fetchData(); }, [target, fetchData]);

  const level = Math.max(1, num(entity?.current_level) || 1);
  const maxLevel = isDistrict ? 1 : (num(entity?.max_level) || (entity?.is_ai_generated ? 5 : 3));
  const levelData: any[] = useMemo(() => {
    const own = Array.isArray(entity?.level_data) ? entity.level_data : [];
    if (own.length) return own;
    return Array.isArray(template?.level_data) ? template.level_data : [];
  }, [entity, template]);

  const nextLevelInfo = useMemo(() => {
    if (isDistrict || level >= maxLevel) return null;
    return levelData.find((item: any) => num(item.level) === level + 1) || null;
  }, [isDistrict, level, maxLevel, levelData]);

  const upgradeCost = useMemo(() => {
    if (!nextLevelInfo || !entity) return null;
    const mult = num(nextLevelInfo.cost_mult) || Math.pow(2, (num(nextLevelInfo.level) || 2) - 1);
    return {
      cost_wealth: Math.round(num(entity.cost_wealth) * mult),
      cost_wood: Math.round(num(entity.cost_wood) * mult),
      cost_stone: Math.round(num(entity.cost_stone) * mult),
      cost_iron: Math.round(num(entity.cost_iron) * mult),
    };
  }, [nextLevelInfo, entity]);

  const upgradeProduction = upgradeCost
    ? upgradeCost.cost_wood + upgradeCost.cost_stone + upgradeCost.cost_iron : 0;

  const outputs = useMemo(() => (isDistrict
    ? (entity?.basket_key ? { [entity.basket_key]: num(entity.basket_output) } : {})
    : scaledBasketOutputs(entity)), [isDistrict, entity]);
  const basketSource = isDistrict ? null : inspectBasketOutputs(entity).source;

  const effects = useMemo(() => {
    const own = (entity?.effects || {}) as Record<string, any>;
    const fromTemplate = (template?.effects || {}) as Record<string, any>;
    const merged = { ...fromTemplate, ...own };
    return Object.entries(merged)
      .filter(([key, value]) => !HIDDEN_EFFECT_KEYS.has(key) && typeof value !== "object" && value !== null && value !== "")
      .map(([key, value]) => ({ key, label: EFFECT_LABELS[key] || key.replace(/_/g, " "), value }));
  }, [entity, template]);

  /**
   * LIVE OPERATION. What this exact structure really made last closed turn, with its crew, its
   * inputs, the settlements those inputs came from and what stopped it. Read-only.
   */
  const { data: reportData } = useManagementReport(sessionId, playerName, currentTurn);
  const operation = useMemo(() => {
    const lines = ((reportData?.report as any)?.producers || []).filter((p: any) => String(p.producer).split(":")[0] === target?.id);
    if (!lines.length) return null;
    const row = { goods: [] as string[], jobs: 0, employed: 0, realized: 0, potential: 0,
      inputs: [] as any[], suppliers: [] as string[], reasons: [] as string[] };
    for (const p of lines) {
      if (!row.goods.includes(p.good)) row.goods.push(p.good);
      row.jobs += num(p.jobs_capacity); row.employed += num(p.employed);
      row.realized += num(p.realized); row.potential += num(p.potential_output);
      for (const i of p.inputs || []) {
        const found = row.inputs.find((x: any) => x.good === i.good);
        if (found) { found.required += num(i.required); found.supplied += num(i.supplied); }
        else row.inputs.push({ good: i.good, required: num(i.required), supplied: num(i.supplied) });
      }
      for (const i of p.margin?.inputs || []) if (i.chosen_supplier && !row.suppliers.includes(i.chosen_supplier)) row.suppliers.push(i.chosen_supplier);
      const reason = p.bottleneck ? `úzké místo: ${p.bottleneck}` : BLOCKED_REASON[p.blocked] || p.blocked || "";
      if (reason && !row.reasons.includes(reason)) row.reasons.push(reason);
    }
    return { ...row, turn: (reportData?.report as any)?.turn };
  }, [reportData, target]);
  const supplierName = (id: string) => ((reportData?.report as any)?.cities || []).find((c: any) => c.id === id)?.name || "jiné město";

  const inProgress = entity?.status && entity.status !== "completed";
  const duration = num(entity?.build_duration) || num(entity?.build_turns) || 0;
  const turnsLeft = inProgress ? Math.max(0, num(entity?.build_started_turn) + duration - currentTurn) : 0;
  const canAct = isOwner && city?.owner_player === playerName;

  const upgradeBlock = (() => {
    if (isDistrict) return "Čtvrti se nevylepšují po úrovních — jejich výkon roste s obsazením a městem.";
    if (inProgress) return "Stavba ještě není dokončená.";
    if (level >= maxLevel) return "Budova je na maximální úrovni.";
    if (!nextLevelInfo) return "Pro tuto budovu nejsou definované další úrovně.";
    if (!canAct) return "Tato stavba nepatří tvé říši.";
    if (upgradeCost && treasury.gold < upgradeCost.cost_wealth) return "Nedostatek zlata.";
    if (upgradeProduction > treasury.production) return "Nedostatek produkce.";
    return null;
  })();

  const handleUpgrade = async () => {
    if (!entity || !nextLevelInfo || !upgradeCost || upgradeBlock) return;
    setBusy("upgrade");
    const newLevel = level + 1;
    const newName = nextLevelInfo.name || entity.name;
    const isWonderConversion = !!entity.is_ai_generated && newLevel === maxLevel && maxLevel >= 5;
    const result = await dispatchCommand({
      sessionId, turnNumber: currentTurn,
      actor: { name: playerName, type: "player" },
      commandType: "UPGRADE_BUILDING",
      commandPayload: {
        cityId: entity.city_id, cityName: city?.name || "",
        buildingId: entity.id, newLevel, newName,
        newEffects: nextLevelInfo.effects || entity.effects,
        costs: upgradeCost, isWonderConversion,
        chronicleText: isWonderConversion
          ? `🏛️ V městě **${city?.name}** se stavba **${entity.name}** změnila v **Div světa: ${newName}**!`
          : `Ve městě **${city?.name}** byla budova **${entity.name}** vylepšena na **${newName}** (úroveň ${newLevel}).`,
      },
    });
    setBusy(null);
    if (!result.ok) { toast.error("Vylepšení selhalo: " + result.error); return; }
    toast.success(`⬆️ ${newName} — úroveň ${newLevel}`, { description: nextLevelInfo.unlock || undefined });
    await fetchData();
    onChanged?.();
  };

  const setDistrictBasket = async (basketKey: string) => {
    if (!entity || !canAct) return;
    setBusy(`basket-${basketKey}`);
    const result = await dispatchCommand({
      sessionId, turnNumber: currentTurn,
      actor: { name: playerName, type: "player" },
      commandType: "SET_DISTRICT_PRODUCTION",
      commandPayload: { districtId: entity.id, basketKey },
    });
    setBusy(null);
    if (!result.ok) { toast.error("Nastavení výroby selhalo: " + result.error); return; }
    toast.success(`Výroba přenastavena na ${getBasketMeta(basketKey).label}`);
    await fetchData();
    onChanged?.();
  };

  return (
    <Sheet open={!!target} onOpenChange={open => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-primary" />
            {entity?.name || (loading ? "Načítám…" : "Stavba")}
          </SheetTitle>
        </SheetHeader>

        {loading && <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Načítám detail…</div>}

        {!loading && !entity && <p className="py-8 text-sm text-muted-foreground">Tuto stavbu se nepodařilo najít.</p>}

        {!loading && entity && <div className="mt-3 space-y-4 text-sm">
          {entity.image_url && <img src={entity.image_url} alt={entity.name} className="h-40 w-full rounded-md object-cover" />}

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{CATEGORY_LABEL[entity.category || entity.district_type] || entity.category || entity.district_type || "stavba"}</Badge>
            {!isDistrict && <Badge variant="outline">Úroveň {level}/{maxLevel}</Badge>}
            {entity.is_wonder && <Badge className="gap-1"><Sparkles className="h-3 w-3" />Div světa</Badge>}
            {entity.is_ai_generated && <Badge variant="outline">Unikátní</Badge>}
            {inProgress
              ? <Badge variant="outline" className="gap-1 border-amber-500/50 text-amber-300"><Clock className="h-3 w-3" />Staví se · {turnsLeft} t.</Badge>
              : <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">Funkční</Badge>}
            {isDistrict && <Badge variant="outline">{entity.is_staffed ? "Obsazená" : "Neobsazená"}</Badge>}
          </div>

          {city && <p className="text-xs text-muted-foreground">
            {city.name} · {city.settlement_level} · {Math.round(num(city.population_total)).toLocaleString("cs-CZ")} obyvatel
          </p>}

          {inProgress && duration > 0 && <div className="space-y-1">
            <Progress value={Math.min(100, ((currentTurn - num(entity.build_started_turn)) / duration) * 100)} className="h-1.5" />
            <p className="text-[11px] text-muted-foreground">Zahájeno v tahu {num(entity.build_started_turn)} · délka {duration} tahů</p>
          </div>}

          {(entity.description || entity.flavor_text || template?.description) && <div className="space-y-2 border-l-2 border-primary/40 pl-3">
            {(entity.description || template?.description) && <p className="text-xs">{entity.description || template?.description}</p>}
            {entity.flavor_text && <p className="text-xs italic text-muted-foreground">„{entity.flavor_text}"</p>}
            {entity.founding_myth && <p className="text-[11px] text-muted-foreground">{entity.founding_myth}</p>}
          </div>}

          {/* WHAT IT DOES */}
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase text-primary">Co dělá</h4>
            {Object.keys(outputs).length > 0 ? <div className="space-y-1">
              {Object.entries(outputs).map(([key, value]) => {
                const meta = getBasketMeta(key);
                return <div key={key} className="flex items-center justify-between border-b border-border/50 py-1 text-xs">
                  <span>{meta.icon} {meta.label}</span>
                  <span className="font-medium">+{fmt(num(value))} / tah</span>
                </div>;
              })}
            </div> : <p className="text-xs text-muted-foreground">Tato stavba nevyrábí žádné zboží — působí jen přes bonusy níže.</p>}
            {basketSource === "instance_suppress" && <p className="text-[11px] text-amber-300">Výroba zboží je u této instance vypnutá.</p>}
            {effects.length > 0 && <div className="mt-2 grid grid-cols-2 gap-1">
              {effects.map(effect => <div key={effect.key} className="flex items-center justify-between rounded bg-muted/40 px-2 py-1 text-[11px]">
                <span className="truncate">{effect.label}</span>
                <span className="font-medium">{typeof effect.value === "number" ? (effect.value > 0 ? `+${fmt(effect.value)}` : fmt(effect.value)) : String(effect.value)}</span>
              </div>)}
            </div>}
            {isDistrict && num(entity.population_capacity) > 0 && <p className="flex items-center gap-1 text-xs"><Users className="h-3 w-3" />Ubytuje {Math.round(num(entity.population_capacity))} obyvatel</p>}
            {!!entity.building_tags?.length && <p className="text-[11px] text-muted-foreground">Tagy: {entity.building_tags.join(", ")}</p>}
          </section>

          {/* LIVE OPERATION */}
          {operation && <section className="space-y-1">
            <h4 className="text-xs font-semibold uppercase text-primary">Jak teď funguje</h4>
            <p className="text-xs">Vyrábí {operation.goods.join(", ")} — {fmt(operation.realized)} z možných {fmt(operation.potential)} jednotek.</p>
            <p className="text-[11px] text-muted-foreground">Pracuje {Math.round(operation.employed)} z {Math.round(operation.jobs)} lidí.</p>
            {operation.inputs.length > 0 && <p className="text-[11px] text-muted-foreground">
              Potřebuje: {operation.inputs.map((i: any) => `${i.good} ${fmt(i.supplied)}/${fmt(i.required)}`).join(" · ")}
            </p>}
            {operation.suppliers.length > 0 && <p className="text-[11px] text-muted-foreground">Vstupy bere z: {operation.suppliers.map(supplierName).join(", ")}</p>}
            {operation.reasons.length > 0 && <p className="text-[11px] text-amber-300">Brání: {operation.reasons.join(", ")}</p>}
            <p className="text-[10px] text-muted-foreground">Data z uzavřeného tahu {operation.turn}.</p>
          </section>}

          {/* CITY IMPACT */}
          {Object.keys(outputs).length > 0 && baskets.length > 0 && <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase text-primary">Dopad na město</h4>
            {Object.keys(outputs).map(key => {
              const row = baskets.find(item => item.basket_key === key);
              if (!row) return <p key={key} className="text-[11px] text-muted-foreground">{getBasketMeta(key).label}: zatím bez tržních dat.</p>;
              const satisfaction = Math.round(num(row.domestic_satisfaction) * 100);
              return <div key={key} className="rounded border border-border/60 p-2 text-[11px]">
                <div className="flex justify-between font-medium"><span>{getBasketMeta(key).icon} {getBasketMeta(key).label}</span><span>{satisfaction}% pokryto</span></div>
                <div className="mt-1 grid grid-cols-2 gap-x-3 text-muted-foreground">
                  <span>Poptávka {fmt(num(row.local_demand))}</span>
                  <span>Nabídka {fmt(num(row.local_supply))}</span>
                  <span>Z budov {fmt(num(row.building_bonus))}</span>
                  <span>Nepokryto {fmt(num(row.unmet_demand))}</span>
                  <span>Vlastní výroba {fmt(num(row.auto_supply))}</span>
                  <span>Na export {fmt(num(row.export_surplus))}</span>
                </div>
              </div>;
            })}
          </section>}

          {/* LEVELS */}
          {!isDistrict && <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase text-primary">Úrovně</h4>
            {levelData.length > 0 ? <div className="space-y-1">
              {levelData.map((item: any) => {
                const itemLevel = num(item.level);
                const state = itemLevel < level ? "hotovo" : itemLevel === level ? "aktuální" : "budoucí";
                return <div key={itemLevel} className={`rounded border p-2 text-[11px] ${itemLevel === level ? "border-primary/60 bg-primary/10" : "border-border/60"}`}>
                  <div className="flex justify-between font-medium"><span>Lvl {itemLevel} · {item.name || entity.name}</span><span className="text-muted-foreground">{state}</span></div>
                  {item.unlock && <p className="mt-1 text-muted-foreground">{item.unlock}</p>}
                  {item.effects && <p className="mt-1 text-muted-foreground">{Object.entries(item.effects).filter(([k, v]) => !HIDDEN_EFFECT_KEYS.has(k) && typeof v !== "object").map(([k, v]) => `${EFFECT_LABELS[k] || k} ${v}`).join(" · ")}</p>}
                </div>;
              })}
            </div> : <p className="text-xs text-muted-foreground">Tato stavba nemá rozepsané další úrovně.</p>}
          </section>}

          {/* COSTS */}
          <section className="space-y-1">
            <h4 className="text-xs font-semibold uppercase text-primary">Náklady stavby</h4>
            <p className="text-xs text-muted-foreground">
              💰 {fmt(num(entity.cost_wealth ?? entity.build_cost_wealth))} zlata · ⚒️ {fmt(num(entity.cost_wood) + num(entity.cost_stone) + num(entity.cost_iron))} produkce · ⏱️ {duration} tahů
            </p>
          </section>

          {/* ACTIONS */}
          <section className="space-y-2 border-t border-border pt-3">
            <h4 className="text-xs font-semibold uppercase text-primary">Co s ní můžeš dělat</h4>
            {!isDistrict && <>
              <Button size="sm" className="w-full" disabled={!!upgradeBlock || busy === "upgrade"} title={upgradeBlock || undefined} onClick={() => void handleUpgrade()}>
                {busy === "upgrade" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <ArrowUp className="mr-1 h-3 w-3" />}
                {nextLevelInfo
                  ? `Vylepšit na úroveň ${level + 1}${upgradeCost ? ` · ${upgradeCost.cost_wealth} zlata / ${upgradeProduction} produkce` : ""}`
                  : "Vylepšení není dostupné"}
              </Button>
              {upgradeBlock && <p className="text-[11px] text-amber-300">{upgradeBlock}</p>}
              {nextLevelInfo?.unlock && !upgradeBlock && <p className="text-[11px] text-muted-foreground">Odemkne: {nextLevelInfo.unlock}</p>}
            </>}

            {isDistrict && entity.district_type === "production" && <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground">Přenastav, co tato čtvrť vyrábí:</p>
              <div className="grid grid-cols-2 gap-1">
                {DEMAND_BASKETS.map(basket => <Button key={basket.key} size="sm" variant={entity.basket_key === basket.key ? "default" : "outline"}
                  className="h-auto justify-start px-2 py-1 text-[11px]" disabled={!canAct || !!busy}
                  onClick={() => void setDistrictBasket(basket.key)}>
                  {busy === `basket-${basket.key}` ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <span className="mr-1">{basket.icon}</span>}
                  {basket.label}
                </Button>)}
              </div>
            </div>}

            {isDistrict && entity.district_type !== "production" && <p className="text-[11px] text-muted-foreground">
              <Hammer className="mr-1 inline h-3 w-3" />Obytné a servisní čtvrti pracují automaticky — mění se jen rozvojem města.
            </p>}

            {!canAct && <p className="text-[11px] text-muted-foreground"><Coins className="mr-1 inline h-3 w-3" />Zásahy jsou možné jen u staveb tvé říše.</p>}
          </section>
        </div>}
      </SheetContent>
    </Sheet>
  );
};

export default BuildingDetailSheet;
