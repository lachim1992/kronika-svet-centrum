import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Castle, Loader2, MapPin, Sparkles, ScrollText } from "lucide-react";
import { toast } from "sonner";

const CITY_TAGS = ["přístav", "pevnost", "svaté město", "obchodní uzel", "hornické město"];

interface Props {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
  myRole: string;
  onCreated: (cityId: string) => void;
}

const FoundSettlementDialog = ({
  open, onClose, sessionId, currentPlayerName, currentTurn, myRole, onCreated,
}: Props) => {
  const [name, setName] = useState("");
  const [flavorPrompt, setFlavorPrompt] = useState("");
  const [legend, setLegend] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [provinces, setProvinces] = useState<{ id: string; name: string; region_id: string | null }[]>([]);
  const [provinceId, setProvinceId] = useState("");
  const [creating, setCreating] = useState(false);
  const [loadingProvinces, setLoadingProvinces] = useState(true);
  const [hasNoProvince, setHasNoProvince] = useState(false);

  const isAdmin = myRole === "admin";

  // Fetch player's provinces
  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoadingProvinces(true);
      const query = supabase.from("provinces").select("id, name, region_id").eq("session_id", sessionId);
      if (!isAdmin) query.eq("owner_player", currentPlayerName);
      const { data } = await query;
      const provs = data || [];
      setProvinces(provs);
      if (provs.length > 0) {
        setProvinceId(provs[0].id);
        setHasNoProvince(false);
      } else {
        setHasNoProvince(true);
      }
      setLoadingProvinces(false);
    })();
  }, [open, sessionId, currentPlayerName, isAdmin]);

  const resetForm = () => {
    setName(""); setFlavorPrompt(""); setLegend(""); setSelectedTags([]);
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const handleCreate = async () => {
    if (!name.trim()) { toast.error("Zadejte název osady"); return; }
    if (!provinceId) { toast.error("Vyberte provincii"); return; }

    const selectedProvince = provinces.find(p => p.id === provinceId);
    setCreating(true);
    try {
      // 0. Find free hex coordinates — fetch all occupied coords in this session
      const { data: occupiedCities } = await supabase
        .from("cities")
        .select("province_q, province_r")
        .eq("session_id", sessionId);
      
      const occupied = new Set(
        (occupiedCities || []).map(c => `${c.province_q},${c.province_r}`)
      );

      // Spiral outward from (0,0) to find a free hex
      let freeQ = 0, freeR = 0, found = false;
      const directions = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
      if (!occupied.has("0,0")) {
        found = true;
      } else {
        outer:
        for (let ring = 1; ring <= 20; ring++) {
          let q = 0, r = -ring;
          for (let d = 0; d < 6; d++) {
            for (let step = 0; step < ring; step++) {
              if (!occupied.has(`${q},${r}`)) {
                freeQ = q; freeR = r; found = true; break outer;
              }
              q += directions[d][0]; r += directions[d][1];
            }
          }
        }
      }
      if (!found) { freeQ = Math.floor(Math.random() * 100) + 20; freeR = Math.floor(Math.random() * 100) + 20; }

      // 1. Create city with unique coordinates
      const { data: cityData, error: cityErr } = await supabase.from("cities").insert({
        session_id: sessionId,
        owner_player: currentPlayerName,
        name: name.trim(),
        province_id: provinceId,
        province: selectedProvince?.name || "",
        level: "Osada",
        settlement_level: "HAMLET",
        tags: selectedTags.length > 0 ? selectedTags : null,
        founded_round: currentTurn,
        flavor_prompt: flavorPrompt.trim() || null,
        province_q: freeQ,
        province_r: freeR,
        population_total: 1000,
        population_peasants: 800,
        population_burghers: 150,
        population_clerics: 50,
        city_stability: 70,
        local_grain_reserve: 0,
        local_granary_capacity: 0,
      }).select("id").single();

      if (cityErr) throw cityErr;
      const cityId = cityData.id;

      // 2. World event (founding legend)
      const slug = `founding-${name.trim().toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
      const legendText = legend.trim()
        ? `${currentPlayerName} založil novou osadu ${name.trim()} v provincii ${selectedProvince?.name || ""}. ${legend.trim()}`
        : `${currentPlayerName} založil novou osadu ${name.trim()} v provincii ${selectedProvince?.name || ""}.`;

      await supabase.from("world_events").insert({
        session_id: sessionId,
        title: `Založení osady ${name.trim()}`,
        slug,
        summary: legendText,
        event_category: "founding",
        created_turn: currentTurn,
        date: `Rok ${currentTurn}`,
        status: "published",
        created_by_type: "player",
        affected_players: [currentPlayerName],
        location_id: cityId,
        participants: JSON.stringify([{ name: currentPlayerName, role: "founder" }]),
      } as any);

      // 3. Feed item
      await supabase.from("world_feed_items").insert({
        session_id: sessionId,
        turn_number: currentTurn,
        feed_type: "gossip",
        text: `V provincii ${selectedProvince?.name || ""} byla založena nová osada ${name.trim()}.`,
        player_source: currentPlayerName,
        related_entity_type: "city",
        related_entity_id: cityId,
      } as any);

      // 4. Chronicle entry
      const chronicleText = legend.trim()
        ? `V roce ${currentTurn} byla založena osada **${name.trim()}** v provincii ${selectedProvince?.name || ""}, pod vládou ${currentPlayerName}. ${legend.trim()}`
        : `V roce ${currentTurn} byla založena osada **${name.trim()}** v provincii ${selectedProvince?.name || ""}, pod vládou ${currentPlayerName}. Nová osada se rodí z prachu a naděje.`;

      await supabase.from("chronicle_entries").insert({
        session_id: sessionId,
        turn_from: currentTurn,
        turn_to: currentTurn,
        text: chronicleText,
      });

      // 5. Wiki entry with flavor + legend — store player text as ai_description
      //    so lazy wiki generation doesn't overwrite it
      const playerSummary = flavorPrompt.trim() || `Nově založená osada v provincii ${selectedProvince?.name || ""}.`;
      const playerLegend = legend.trim() || null;
      const playerAiDesc = playerLegend
        ? `${playerSummary}\n\n${playerLegend}`
        : playerSummary;

      await supabase.from("wiki_entries").upsert({
        session_id: sessionId,
        entity_type: "city",
        entity_id: cityId,
        entity_name: name.trim(),
        summary: playerSummary,
        body_md: playerLegend,
        ai_description: playerAiDesc,
        status: "published",
      } as any, { onConflict: "session_id,entity_type,entity_id" });

      // 6. Auto-discover entities
      const discoveryRows: any[] = [
        { session_id: sessionId, player_name: currentPlayerName, entity_type: "city", entity_id: cityId, source: "founded" },
        { session_id: sessionId, player_name: currentPlayerName, entity_type: "province", entity_id: provinceId, source: "founded" },
      ];
      if (selectedProvince?.region_id) {
        discoveryRows.push({ session_id: sessionId, player_name: currentPlayerName, entity_type: "region", entity_id: selectedProvince.region_id, source: "founded" });
      }
      // Discover sibling cities
      const { data: siblings } = await supabase.from("cities").select("id").eq("session_id", sessionId).eq("province_id", provinceId).neq("id", cityId);
      if (siblings) {
        for (const s of siblings) {
          discoveryRows.push({ session_id: sessionId, player_name: currentPlayerName, entity_type: "city", entity_id: s.id, source: "founded" });
        }
      }
      await supabase.from("discoveries").upsert(discoveryRows, { onConflict: "session_id,player_name,entity_type,entity_id" });

      // 7. Create settlement resource profile for economic engine
      const seed = Math.abs(cityId.split("").reduce((h: number, c: string) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0));
      const roll = seed % 100;
      const specialType = roll < 25 ? "IRON" : roll < 50 ? "STONE" : "NONE";
      await supabase.from("settlement_resource_profiles").upsert({
        city_id: cityId,
        produces_grain: true,
        produces_wood: true,
        special_resource_type: specialType,
        base_grain: 8,
        base_wood: 6,
        base_special: specialType !== "NONE" ? 2 : 0,
        founded_seed: cityId,
      } as any, { onConflict: "city_id" });

      toast.success(`🏗️ Osada ${name.trim()} založena!`);
      resetForm();
      onClose();
      onCreated(cityId);
    } catch (err: any) {
      console.error(err);
      toast.error("Chyba: " + (err.message || "Nepodařilo se založit osadu"));
    }
    setCreating(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { resetForm(); onClose(); } }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Castle className="h-5 w-5 text-primary" />
            Založit novou osadu
          </DialogTitle>
        </DialogHeader>

        {loadingProvinces ? (
          <div className="py-8 text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
            <p className="text-sm text-muted-foreground mt-2">Načítání provincií…</p>
          </div>
        ) : hasNoProvince ? (
          <div className="py-8 text-center space-y-3">
            <MapPin className="h-10 w-10 text-muted-foreground mx-auto opacity-40" />
            <p className="text-sm text-muted-foreground">
              Nemáte žádnou provincii. Nejprve si založte provincii přes záložku Svět nebo onboarding.
            </p>
            <Button variant="outline" onClick={onClose} className="font-display">Zavřít</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Province */}
            <div>
              <Label className="font-display text-sm font-semibold">Provincie</Label>
              {provinces.length === 1 ? (
                <p className="text-sm mt-1 flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                  <strong>{provinces[0].name}</strong>
                </p>
              ) : (
                <Select value={provinceId} onValueChange={setProvinceId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Vyberte provincii" /></SelectTrigger>
                  <SelectContent>
                    {provinces.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Name */}
            <div>
              <Label className="font-display text-sm font-semibold">Název osady</Label>
              <Input
                className="mt-1"
                placeholder="např. Stříbrný Brod"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={100}
              />
            </div>

            {/* Flavor Prompt */}
            <div>
              <Label className="font-display text-sm font-semibold flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Atmosféra města (flavor prompt)
              </Label>
              <Textarea
                className="mt-1 min-h-[60px]"
                placeholder="Popište atmosféru, styl a charakter osady — AI použije pro generování příběhů, obrázků a ság…"
                value={flavorPrompt}
                onChange={e => setFlavorPrompt(e.target.value)}
                maxLength={500}
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">{flavorPrompt.length}/500</p>
            </div>

            {/* Legend */}
            <div>
              <Label className="font-display text-sm font-semibold flex items-center gap-1.5">
                <ScrollText className="h-3.5 w-3.5 text-primary" />
                Zakladatelská legenda
              </Label>
              <Textarea
                className="mt-1 min-h-[80px]"
                placeholder="Příběh o založení — co přivedlo osadníky, jaká proroctví, jaké mýty provázejí vznik…"
                value={legend}
                onChange={e => setLegend(e.target.value)}
                maxLength={1000}
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">{legend.length}/1000</p>
            </div>

            {/* Tags */}
            <div>
              <Label className="font-display text-sm font-semibold">Charakter (volitelné)</Label>
              <div className="flex gap-1.5 flex-wrap mt-1.5">
                {CITY_TAGS.map(tag => (
                  <Badge
                    key={tag}
                    variant={selectedTags.includes(tag) ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => toggleTag(tag)}
                  >{tag}</Badge>
                ))}
              </div>
            </div>

            {/* Submit */}
            <div className="flex gap-2 pt-2">
              <Button onClick={handleCreate} disabled={creating || !name.trim()} className="font-display flex-1" size="lg">
                {creating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Zakládám…</> : "Založit osadu"}
              </Button>
              <Button variant="outline" onClick={onClose} className="font-display" size="lg">Zrušit</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default FoundSettlementDialog;
