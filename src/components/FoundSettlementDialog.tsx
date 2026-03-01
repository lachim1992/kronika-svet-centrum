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
import { dispatchCommand } from "@/lib/commands";

const CITY_TAGS = ["přístav", "pevnost", "svaté město", "obchodní uzel", "hornické město"];

interface Props {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
  myRole: string;
  onCreated: (cityId: string) => void;
  /** Pre-selected hex coordinates from the map */
  targetQ?: number;
  targetR?: number;
}

const FoundSettlementDialog = ({
  open, onClose, sessionId, currentPlayerName, currentTurn, myRole, onCreated,
  targetQ, targetR,
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

  const isAdmin = myRole === "admin" || myRole === "moderator";

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
      const result = await dispatchCommand({
        sessionId,
        turnNumber: currentTurn,
        actor: { name: currentPlayerName, type: "player" },
        commandType: "FOUND_CITY",
        commandPayload: {
          cityName: name.trim(),
          provinceId,
          provinceName: selectedProvince?.name || "",
          tags: selectedTags.length > 0 ? selectedTags : [],
          flavorPrompt: flavorPrompt.trim() || null,
          legend: legend.trim() || null,
          ...(targetQ !== undefined && targetR !== undefined ? { provinceQ: targetQ, provinceR: targetR } : {}),
        },
      });

      if (!result.ok) {
        throw new Error(result.error || "Nepodařilo se založit osadu");
      }

      const cityId = result.sideEffects?.cityId;
      if (!cityId) throw new Error("Server nevrátil cityId");

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
