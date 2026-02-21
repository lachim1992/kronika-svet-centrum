import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  MapPin, Mountain, TreePine, Waves, Flame as VolcanoIcon, Snowflake, Wind,
  Loader2, Check, Castle, Globe, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

/* ─── Constants ─── */

const PROVINCE_TYPES = [
  { value: "coastal", label: "Pobřežní", icon: Waves, desc: "Přístup k moři, obchod, rybolov" },
  { value: "mountain", label: "Horská", icon: Mountain, desc: "Těžba, přirozená obrana" },
  { value: "valley", label: "Údolní", icon: MapPin, desc: "Úrodná půda, zemědělství" },
  { value: "forest", label: "Lesní", icon: TreePine, desc: "Dřevo, lov, skrytost" },
  { value: "steppe", label: "Stepní", icon: Wind, desc: "Koně, mobilita, pastevectví" },
  { value: "volcanic", label: "Vulkanická", icon: VolcanoIcon, desc: "Minerály, geotermální energie" },
  { value: "tundra", label: "Tundra", icon: Snowflake, desc: "Odolnost, izolace" },
];

const BIOME_ICONS: Record<string, typeof Mountain> = {
  coast: Waves,
  mountains: Mountain,
  forest: TreePine,
  plains: Wind,
  volcanic: VolcanoIcon,
  tundra: Snowflake,
  desert: MapPin,
};

/* ─── Types ─── */

interface Props {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
  myRole: string;
  onComplete: () => void;
}

interface RegionRow {
  id: string;
  name: string;
  biome: string | null;
  description: string | null;
  tags: string[] | null;
  owner_player: string | null;
  is_homeland: boolean | null;
}

/* ─── Main Component ─── */

const ProvinceOnboardingWizard = ({ sessionId, currentPlayerName, currentTurn, myRole, onComplete }: Props) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 – region
  const [regions, setRegions] = useState<RegionRow[]>([]);
  const [loadingRegions, setLoadingRegions] = useState(true);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);

  // Step 2 – province
  const [provinceName, setProvinceName] = useState("");
  const [provinceType, setProvinceType] = useState("");
  const [flavorPrompt, setFlavorPrompt] = useState("");
  const [creatingProvince, setCreatingProvince] = useState(false);
  const [createdProvinceId, setCreatedProvinceId] = useState<string | null>(null);

  // Step 3 – settlement
  const [settlementName, setSettlementName] = useState("");
  const [creatingSettlement, setCreatingSettlement] = useState(false);

  /* ── Fetch available regions ── */
  useEffect(() => {
    (async () => {
      setLoadingRegions(true);
      // For admin: show all regions. For players: show discovered + homeland regions.
      let query = supabase
        .from("regions")
        .select("id, name, biome, description, tags, owner_player, is_homeland")
        .eq("session_id", sessionId);

      if (myRole !== "admin") {
        // Get discovered region IDs
        const { data: discoveries } = await supabase
          .from("discoveries")
          .select("entity_id")
          .eq("session_id", sessionId)
          .eq("player_name", currentPlayerName)
          .eq("entity_type", "region");

        const discoveredIds = (discoveries || []).map(d => d.entity_id);

        // Also include regions where the player is the owner or that are starting regions
        const { data: allRegions } = await query;
        const filtered = (allRegions || []).filter(r =>
          r.owner_player === currentPlayerName ||
          r.is_homeland === true && r.owner_player === currentPlayerName ||
          discoveredIds.includes(r.id) ||
          // Show "unowned" regions as starting options
          !r.owner_player
        );
        setRegions(filtered);
      } else {
        const { data } = await query;
        setRegions(data || []);
      }
      setLoadingRegions(false);
    })();
  }, [sessionId, currentPlayerName, myRole]);

  /* ── Step 1 handlers ── */
  const handleSelectRegion = () => {
    if (!selectedRegionId) { toast.error("Vyberte region"); return; }
    setStep(2);
  };

  const handleCreateHomeRegion = async () => {
    // Quick-create a homeland region for the player (if no regions exist at all)
    setCreatingProvince(true);
    try {
      const { data, error } = await supabase
        .from("regions")
        .insert({
          session_id: sessionId,
          name: `${currentPlayerName} – Domovina`,
          owner_player: currentPlayerName,
          is_homeland: true,
          biome: "plains",
        })
        .select("id, name, biome, description, tags, owner_player, is_homeland")
        .single();
      if (error) throw error;
      setRegions(prev => [...prev, data]);
      setSelectedRegionId(data.id);
      toast.success("Region vytvořen!");
      setStep(2);
    } catch (err: any) {
      toast.error("Chyba: " + (err.message || "Nepodařilo se vytvořit region"));
    }
    setCreatingProvince(false);
  };

  /* ── Step 2: Create Province ── */
  const handleCreateProvince = async () => {
    if (!provinceName.trim()) { toast.error("Zadejte název provincie"); return; }
    if (!provinceType) { toast.error("Vyberte typ provincie"); return; }
    if (!selectedRegionId) { toast.error("Chybí region"); return; }

    setCreatingProvince(true);
    try {
      const { data, error } = await supabase
        .from("provinces")
        .insert({
          session_id: sessionId,
          name: provinceName.trim(),
          owner_player: currentPlayerName,
          region_id: selectedRegionId,
          description: flavorPrompt || null,
          tags: [provinceType],
        })
        .select("id")
        .single();
      if (error) throw error;

      setCreatedProvinceId(data.id);
      toast.success(`Provincie ${provinceName} založena!`);
      setStep(3);
    } catch (err: any) {
      toast.error("Chyba: " + (err.message || "Nepodařilo se založit provincii"));
    }
    setCreatingProvince(false);
  };

  /* ── Step 3: Found Settlement ── */
  const handleCreateSettlement = async () => {
    if (!settlementName.trim()) { toast.error("Zadejte název osady"); return; }
    if (!createdProvinceId) { toast.error("Chybí provincie"); return; }

    setCreatingSettlement(true);
    try {
      const { data: cityData, error: cityErr } = await supabase
        .from("cities")
        .insert({
          session_id: sessionId,
          owner_player: currentPlayerName,
          name: settlementName.trim(),
          province_id: createdProvinceId,
          province: provinceName.trim(),
          level: "Osada",
          settlement_level: "HAMLET",
          tags: [provinceType],
          founded_round: currentTurn,
        })
        .select("id")
        .single();
      if (cityErr) throw cityErr;

      // World event
      const slug = `founding-${settlementName.trim().toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
      await supabase.from("world_events").insert({
        session_id: sessionId,
        title: `Založení osady ${settlementName.trim()}`,
        slug,
        summary: `${currentPlayerName} založil novou osadu ${settlementName.trim()} v provincii ${provinceName}.`,
        event_category: "founding",
        created_turn: currentTurn,
        date: `Rok ${currentTurn}`,
        status: "published",
        created_by_type: "player",
        affected_players: [currentPlayerName],
        location_id: cityData.id,
        participants: JSON.stringify([{ name: currentPlayerName, role: "founder" }]),
      } as any);

      // Feed item
      await supabase.from("world_feed_items").insert({
        session_id: sessionId,
        turn_number: currentTurn,
        feed_type: "gossip",
        text: `V provincii ${provinceName} byla založena nová osada ${settlementName.trim()}.`,
        player_source: currentPlayerName,
        related_entity_type: "city",
        related_entity_id: cityData.id,
      } as any);

      toast.success(`Osada ${settlementName} založena!`);
      onComplete();
    } catch (err: any) {
      toast.error("Chyba: " + (err.message || "Nepodařilo se založit osadu"));
    }
    setCreatingSettlement(false);
  };

  /* ── Derived ── */
  const selectedRegion = regions.find(r => r.id === selectedRegionId);
  const selectedTypeObj = PROVINCE_TYPES.find(t => t.value === provinceType);

  /* ── Render ── */
  return (
    <div className="max-w-xl mx-auto space-y-6 py-4">
      {/* Progress */}
      <StepIndicator current={step} />

      {step === 1 && (
        <RegionStep
          regions={regions}
          loading={loadingRegions}
          selectedId={selectedRegionId}
          onSelect={setSelectedRegionId}
          onConfirm={handleSelectRegion}
          onCreateHome={handleCreateHomeRegion}
          creating={creatingProvince}
        />
      )}

      {step === 2 && (
        <ProvinceStep
          regionName={selectedRegion?.name || ""}
          provinceName={provinceName}
          provinceType={provinceType}
          flavorPrompt={flavorPrompt}
          creating={creatingProvince}
          onNameChange={setProvinceName}
          onTypeChange={setProvinceType}
          onFlavorChange={setFlavorPrompt}
          onSubmit={handleCreateProvince}
        />
      )}

      {step === 3 && (
        <SettlementStep
          provinceName={provinceName}
          provinceType={provinceType}
          selectedType={selectedTypeObj}
          settlementName={settlementName}
          creating={creatingSettlement}
          onNameChange={setSettlementName}
          onSubmit={handleCreateSettlement}
        />
      )}
    </div>
  );
};

export default ProvinceOnboardingWizard;

/* ════════════════════════════════════════════════════════════
   Sub-components
   ════════════════════════════════════════════════════════════ */

function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: "Region" },
    { n: 2, label: "Provincie" },
    { n: 3, label: "Osada" },
  ];
  return (
    <div className="flex items-center gap-2 justify-center">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center gap-2">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-display font-semibold ${
            current > s.n ? "bg-primary/20 text-primary" : current === s.n ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
          }`}>
            {current > s.n
              ? <Check className="h-3.5 w-3.5" />
              : <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                  current === s.n ? "bg-primary text-primary-foreground" : "bg-muted-foreground/30 text-foreground"
                }`}>{s.n}</span>}
            {s.label}
          </div>
          {i < steps.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
        </div>
      ))}
    </div>
  );
}

/* ── Step 1: Region Selection ── */

function RegionStep({ regions, loading, selectedId, onSelect, onConfirm, onCreateHome, creating }: {
  regions: RegionRow[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onConfirm: () => void;
  onCreateHome: () => void;
  creating: boolean;
}) {
  if (loading) {
    return (
      <div className="game-card p-8 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
        <p className="text-sm text-muted-foreground mt-2">Načítání regionů…</p>
      </div>
    );
  }

  return (
    <div className="game-card p-6 space-y-5">
      <div className="text-center space-y-2">
        <Globe className="h-8 w-8 text-primary mx-auto" />
        <h2 className="text-xl font-display font-bold">Vyberte svůj region</h2>
        <p className="text-sm text-muted-foreground">
          Kde ve světě začne vaše historie? Vyberte region, do kterého umístíte svou provincii.
        </p>
      </div>

      {regions.length > 0 ? (
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {regions.map(r => {
            const BiomeIcon = BIOME_ICONS[r.biome || "plains"] || MapPin;
            return (
              <button
                key={r.id}
                onClick={() => onSelect(r.id)}
                className={`w-full p-4 rounded-lg border text-left transition-all ${
                  selectedId === r.id
                    ? "border-primary bg-primary/10 shadow-sm"
                    : "border-border bg-card hover:border-primary/30"
                }`}
              >
                <div className="flex items-center gap-3">
                  <BiomeIcon className={`h-5 w-5 shrink-0 ${selectedId === r.id ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="flex-1 min-w-0">
                    <span className="font-display font-semibold text-sm">{r.name}</span>
                    {r.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{r.description}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {r.biome && <Badge variant="outline" className="text-[9px]">{r.biome}</Badge>}
                    {r.owner_player && (
                      <span className="text-[10px] text-muted-foreground">{r.owner_player}</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-6 space-y-3">
          <p className="text-sm text-muted-foreground">Žádné dostupné regiony. Vytvořte si svůj domovský region.</p>
          <Button onClick={onCreateHome} disabled={creating} className="font-display">
            {creating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Vytvářím…</> : "Vytvořit domovský region"}
          </Button>
        </div>
      )}

      {regions.length > 0 && (
        <div className="flex gap-2">
          <Button onClick={onConfirm} disabled={!selectedId} className="flex-1 font-display" size="lg">
            Pokračovat
          </Button>
          <Button variant="outline" onClick={onCreateHome} disabled={creating} className="font-display" size="lg">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Nový region"}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ── Step 2: Province Creation ── */

function ProvinceStep({ regionName, provinceName, provinceType, flavorPrompt, creating, onNameChange, onTypeChange, onFlavorChange, onSubmit }: {
  regionName: string;
  provinceName: string;
  provinceType: string;
  flavorPrompt: string;
  creating: boolean;
  onNameChange: (v: string) => void;
  onTypeChange: (v: string) => void;
  onFlavorChange: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="game-card p-6 space-y-5">
      <div className="text-center space-y-2">
        <MapPin className="h-8 w-8 text-primary mx-auto" />
        <h2 className="text-xl font-display font-bold">Založte svou provincii</h2>
        <p className="text-sm text-muted-foreground">
          Region <strong>{regionName}</strong> — nyní založte provincii, kde bude stát vaše budoucí říše.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-semibold font-display mb-1.5 block">Název provincie</label>
          <Input placeholder="např. Údolí Stříbrného potoka" value={provinceName} onChange={e => onNameChange(e.target.value)} />
        </div>

        <div>
          <label className="text-sm font-semibold font-display mb-2 block">Typ provincie</label>
          <div className="grid grid-cols-2 gap-2">
            {PROVINCE_TYPES.map(t => {
              const Icon = t.icon;
              return (
                <button key={t.value} onClick={() => onTypeChange(t.value)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    provinceType === t.value ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-card hover:border-primary/30"
                  }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`h-4 w-4 ${provinceType === t.value ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="text-sm font-semibold">{t.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{t.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold font-display mb-1.5 block">
            Flavor prompt <span className="text-muted-foreground font-normal">(volitelné)</span>
          </label>
          <Textarea placeholder="Popište atmosféru vaší provincie — AI ji použije pro tón narativů..."
            value={flavorPrompt} onChange={e => onFlavorChange(e.target.value)} rows={3} />
        </div>
      </div>

      <Button onClick={onSubmit} disabled={creating || !provinceName.trim() || !provinceType} className="w-full font-display" size="lg">
        {creating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Zakládám…</> : "Založit provincii"}
      </Button>
    </div>
  );
}

/* ── Step 3: Settlement ── */

function SettlementStep({ provinceName, provinceType, selectedType, settlementName, creating, onNameChange, onSubmit }: {
  provinceName: string;
  provinceType: string;
  selectedType: typeof PROVINCE_TYPES[number] | undefined;
  settlementName: string;
  creating: boolean;
  onNameChange: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="game-card p-6 space-y-5">
      <div className="text-center space-y-2">
        <Castle className="h-8 w-8 text-primary mx-auto" />
        <h2 className="text-xl font-display font-bold">Založte první osadu</h2>
        <p className="text-sm text-muted-foreground">
          Provincie <strong>{provinceName}</strong> je připravena. Založte v ní svou první osadu.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-semibold font-display mb-1.5 block">Název osady</label>
          <Input placeholder="např. Brod u Tří dubů" value={settlementName} onChange={e => onNameChange(e.target.value)} />
        </div>

        <div className="bg-muted/30 p-3 rounded-lg text-xs text-muted-foreground space-y-1">
          <p>📍 Provincie: <strong className="text-foreground">{provinceName}</strong></p>
          <p>🏘️ Typ: <strong className="text-foreground">Osada (Hamlet)</strong></p>
          {selectedType && <p>{selectedType.label}: {selectedType.desc}</p>}
        </div>
      </div>

      <Button onClick={onSubmit} disabled={creating || !settlementName.trim()} className="w-full font-display" size="lg">
        {creating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Zakládám…</> : "Založit osadu"}
      </Button>
    </div>
  );
}
