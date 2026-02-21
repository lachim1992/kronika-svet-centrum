import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Mountain, TreePine, Waves, Flame as VolcanoIcon, Snowflake, Wind, Loader2, Check, Castle } from "lucide-react";
import { toast } from "sonner";

const PROVINCE_TYPES = [
  { value: "coastal", label: "Pobřežní", icon: Waves, desc: "Přístup k moři, obchod, rybolov" },
  { value: "mountain", label: "Horská", icon: Mountain, desc: "Těžba, přirozená obrana" },
  { value: "valley", label: "Údolní", icon: MapPin, desc: "Úrodná půda, zemědělství" },
  { value: "forest", label: "Lesní", icon: TreePine, desc: "Dřevo, lov, skrytost" },
  { value: "steppe", label: "Stepní", icon: Wind, desc: "Koně, mobilita, pastevectví" },
  { value: "volcanic", label: "Vulkanická", icon: VolcanoIcon, desc: "Minerály, geotermální energie" },
  { value: "tundra", label: "Tundra", icon: Snowflake, desc: "Odolnost, izolace" },
];

interface Props {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
  onComplete: () => void;
}

const ProvinceOnboardingWizard = ({ sessionId, currentPlayerName, currentTurn, onComplete }: Props) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [provinceName, setProvinceName] = useState("");
  const [provinceType, setProvinceType] = useState("");
  const [flavorPrompt, setFlavorPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdProvinceId, setCreatedProvinceId] = useState<string | null>(null);

  // Step 2 state
  const [settlementName, setSettlementName] = useState("");
  const [creatingSettlement, setCreatingSettlement] = useState(false);

  const handleCreateProvince = async () => {
    if (!provinceName.trim()) { toast.error("Zadejte název provincie"); return; }
    if (!provinceType) { toast.error("Vyberte typ provincie"); return; }

    setCreating(true);
    try {
      // Find or create home region for this player
      const { data: existingRegion } = await supabase
        .from("regions")
        .select("id")
        .eq("session_id", sessionId)
        .eq("owner_player", currentPlayerName)
        .eq("is_homeland", true)
        .maybeSingle();

      let regionId = existingRegion?.id;

      if (!regionId) {
        // Create a homeland region
        const { data: newRegion, error: regErr } = await supabase
          .from("regions")
          .insert({
            session_id: sessionId,
            name: `${currentPlayerName} – Domovina`,
            owner_player: currentPlayerName,
            is_homeland: true,
            biome: provinceType === "coastal" ? "coast" : provinceType === "mountain" ? "mountains" : provinceType === "forest" ? "forest" : provinceType === "steppe" ? "plains" : provinceType === "volcanic" ? "volcanic" : provinceType === "tundra" ? "tundra" : "plains",
            description: flavorPrompt || undefined,
          })
          .select("id")
          .single();
        if (regErr) throw regErr;
        regionId = newRegion.id;
      }

      // Create province
      const { data: prov, error: provErr } = await supabase
        .from("provinces")
        .insert({
          session_id: sessionId,
          name: provinceName.trim(),
          owner_player: currentPlayerName,
          region_id: regionId,
          description: flavorPrompt || null,
          tags: [provinceType],
        })
        .select("id")
        .single();

      if (provErr) throw provErr;
      setCreatedProvinceId(prov.id);
      toast.success(`Provincie ${provinceName} založena!`);
      setStep(2);
    } catch (err: any) {
      console.error(err);
      toast.error("Chyba při zakládání provincie: " + (err.message || "Neznámá chyba"));
    }
    setCreating(false);
  };

  const handleCreateSettlement = async () => {
    if (!settlementName.trim()) { toast.error("Zadejte název osady"); return; }
    if (!createdProvinceId) { toast.error("Chybí provincie"); return; }

    setCreatingSettlement(true);
    try {
      // Create settlement (Osada only for non-admin)
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

      // Create world event for founding
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

      // Create feed item
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
      console.error(err);
      toast.error("Chyba při zakládání osady: " + (err.message || "Neznámá chyba"));
    }
    setCreatingSettlement(false);
  };

  const selectedType = PROVINCE_TYPES.find(t => t.value === provinceType);

  return (
    <div className="max-w-xl mx-auto space-y-6 py-4">
      {/* Progress indicator */}
      <div className="flex items-center gap-3 justify-center">
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-display font-semibold ${step >= 1 ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
          {step > 1 ? <Check className="h-4 w-4" /> : <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">1</span>}
          Provincie
        </div>
        <div className="w-8 h-px bg-border" />
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-display font-semibold ${step >= 2 ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
          <span className="w-5 h-5 rounded-full bg-muted-foreground/30 text-foreground flex items-center justify-center text-xs">2</span>
          Osada
        </div>
      </div>

      {step === 1 && (
        <div className="game-card p-6 space-y-5">
          <div className="text-center space-y-2">
            <MapPin className="h-8 w-8 text-primary mx-auto" />
            <h2 className="text-xl font-display font-bold">Založte svou provincii</h2>
            <p className="text-sm text-muted-foreground">
              Než založíte první osadu, musíte nejprve ustanovit svou provincii — místo, kde bude stát vaše budoucí říše.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold font-display mb-1.5 block">Název provincie</label>
              <Input
                placeholder="např. Údolí Stříbrného potoka"
                value={provinceName}
                onChange={e => setProvinceName(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-semibold font-display mb-2 block">Typ provincie</label>
              <div className="grid grid-cols-2 gap-2">
                {PROVINCE_TYPES.map(t => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.value}
                      onClick={() => setProvinceType(t.value)}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        provinceType === t.value
                          ? "border-primary bg-primary/10 shadow-sm"
                          : "border-border bg-card hover:border-primary/30"
                      }`}
                    >
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
              <label className="text-sm font-semibold font-display mb-1.5 block">Flavor prompt <span className="text-muted-foreground font-normal">(volitelné)</span></label>
              <Textarea
                placeholder="Popište atmosféru vaší provincie — AI ji použije pro tón narativů..."
                value={flavorPrompt}
                onChange={e => setFlavorPrompt(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <Button
            onClick={handleCreateProvince}
            disabled={creating || !provinceName.trim() || !provinceType}
            className="w-full font-display"
            size="lg"
          >
            {creating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Zakládám...</> : "Založit provincii"}
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="game-card p-6 space-y-5">
          <div className="text-center space-y-2">
            <Castle className="h-8 w-8 text-primary mx-auto" />
            <h2 className="text-xl font-display font-bold">Založte první osadu</h2>
            <p className="text-sm text-muted-foreground">
              Vaše provincie <strong>{provinceName}</strong> je připravena. Nyní v ní založte svou první osadu.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold font-display mb-1.5 block">Název osady</label>
              <Input
                placeholder="např. Brod u Tří dubů"
                value={settlementName}
                onChange={e => setSettlementName(e.target.value)}
              />
            </div>

            <div className="bg-muted/30 p-3 rounded-lg text-xs text-muted-foreground space-y-1">
              <p>📍 Provincie: <strong className="text-foreground">{provinceName}</strong></p>
              <p>🏘️ Typ: <strong className="text-foreground">Osada (Hamlet)</strong></p>
              {selectedType && <p>{selectedType.label}: {selectedType.desc}</p>}
            </div>
          </div>

          <Button
            onClick={handleCreateSettlement}
            disabled={creatingSettlement || !settlementName.trim()}
            className="w-full font-display"
            size="lg"
          >
            {creatingSettlement ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Zakládám...</> : "Založit osadu"}
          </Button>
        </div>
      )}
    </div>
  );
};

export default ProvinceOnboardingWizard;
