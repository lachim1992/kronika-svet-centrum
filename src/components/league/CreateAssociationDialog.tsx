import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Shield, ChevronRight, ChevronLeft, Check } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
  cities: Map<string, string>;
  onCreated: () => void;
  existingTypes?: string[]; // types already created by this player
}

const ASSOC_TYPES = [
  { value: "sphaera", label: "Svaz Sphaery", icon: "⚔️", desc: "Řídí ligové týmy ve hře Sphaera" },
  { value: "olympic", label: "Olympijský výbor", icon: "🏟️", desc: "Organizuje olympijské hry a reprezentaci" },
  { value: "gladiator", label: "Gladiátorská gilda", icon: "💀", desc: "Spravuje gladiátorské arény a školy" },
];

const CreateAssociationDialog = ({ open, onOpenChange, sessionId, currentPlayerName, currentTurn, cities, onCreated, existingTypes = [] }: Props) => {
  const firstAvailable = ASSOC_TYPES.find(t => !existingTypes.includes(t.value))?.value || "sphaera";
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [motto, setMotto] = useState("");
  const [description, setDescription] = useState("");
  const [cityId, setCityId] = useState("");
  const [assocType, setAssocType] = useState(firstAvailable);
  const [colorPrimary, setColorPrimary] = useState("#8b0000");
  const [colorSecondary, setColorSecondary] = useState("#1a1a2e");
  const [creating, setCreating] = useState(false);

  const cityEntries = Array.from(cities.entries());

  const handleCreate = async () => {
    if (!cityId || !name.trim()) {
      toast.error("Vyplňte název a vyberte sídlo svazu.");
      return;
    }
    setCreating(true);
    try {
      const { data: assocData, error } = await supabase.from("sports_associations").insert({
        session_id: sessionId,
        city_id: cityId,
        player_name: currentPlayerName,
        association_type: assocType,
        name: name.trim(),
        motto: motto.trim() || null,
        description: description.trim() || null,
        color_primary: colorPrimary,
        color_secondary: colorSecondary,
        reputation: 10,
        scouting_level: 1,
        youth_development: 1,
        training_quality: 1,
        fan_base: 50,
        budget: 50,
        founded_turn: currentTurn,
      }).select().single();
      if (error) throw error;

      // Auto-create first academy under this association
      const isGladiatorial = assocType === "gladiator";
      const academyName = assocType === "gladiator"
        ? `Gladiátorská škola – ${cities.get(cityId) || "?"}`
        : assocType === "olympic"
          ? `Olympijská akademie – ${cities.get(cityId) || "?"}`
          : `Akademie Sphaery – ${cities.get(cityId) || "?"}`;
      await supabase.from("academies").insert({
        session_id: sessionId,
        city_id: cityId,
        player_name: currentPlayerName,
        name: academyName,
        color_primary: colorPrimary,
        color_secondary: colorSecondary,
        founded_turn: currentTurn,
        status: "active",
        infrastructure: 10,
        reputation: 10,
        is_gladiatorial: isGladiatorial,
        association_id: assocData.id,
        academy_type: assocType,
      } as any);

      toast.success(`${name} založen s první akademií!`);
      onCreated();
      onOpenChange(false);
      // Reset
      setStep(0);
      setName("");
      setMotto("");
      setDescription("");
      setAssocType(firstAvailable);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreating(false);
    }
  };

  const selectedType = ASSOC_TYPES.find(t => t.value === assocType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-primary/20">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Založit sportovní svaz
            <Badge variant="outline" className="text-[9px] ml-auto">Krok {step + 1}/3</Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Step 0: Type + Name + Motto */}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Typ svazu</label>
              <div className="grid gap-2">
                {ASSOC_TYPES.map(t => {
                  const alreadyExists = existingTypes.includes(t.value);
                  return (
                    <div
                      key={t.value}
                      onClick={() => {
                        if (alreadyExists) return;
                        setAssocType(t.value);
                        if (!name) setName(t.label);
                      }}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                        alreadyExists
                          ? "border-border/50 opacity-40 cursor-not-allowed"
                          : assocType === t.value
                            ? "border-primary bg-primary/10 cursor-pointer"
                            : "border-border hover:border-primary/30 cursor-pointer"
                      }`}
                    >
                      <span className="text-xl">{t.icon}</span>
                      <div className="flex-1">
                        <div className="text-sm font-bold">{t.label}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {alreadyExists ? "✓ Již založen" : t.desc}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Název svazu</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="např. Svaz Sphaery Říma" className="text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Motto <span className="font-normal">(volitelné)</span></label>
              <Input value={motto} onChange={e => setMotto(e.target.value)} placeholder="Za slávu a čest!" className="text-sm" />
            </div>
          </div>
        )}

        {/* Step 1: City + Colors */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Sídlo svazu</label>
              <Select value={cityId} onValueChange={setCityId}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Vyberte město..." />
                </SelectTrigger>
                <SelectContent>
                  {cityEntries.map(([id, cname]) => (
                    <SelectItem key={id} value={id}>{cname}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Hlavní barva</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={colorPrimary} onChange={e => setColorPrimary(e.target.value)} className="w-10 h-10 rounded cursor-pointer border border-border" />
                  <Input value={colorPrimary} onChange={e => setColorPrimary(e.target.value)} className="text-xs font-mono flex-1" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Sekundární barva</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={colorSecondary} onChange={e => setColorSecondary(e.target.value)} className="w-10 h-10 rounded cursor-pointer border border-border" />
                  <Input value={colorSecondary} onChange={e => setColorSecondary(e.target.value)} className="text-xs font-mono flex-1" />
                </div>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Popis <span className="font-normal">(volitelné)</span></label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Krátký popis svazu..." rows={2} className="text-sm" />
            </div>
          </div>
        )}

        {/* Step 2: Confirmation */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/20 border border-border">
              <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl border-4 shrink-0"
                style={{ backgroundColor: colorPrimary, borderColor: colorSecondary }}>
                {selectedType?.icon}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-display font-bold text-base">{name || "Bez názvu"}</h3>
                {motto && <p className="text-[10px] text-muted-foreground italic">„{motto}"</p>}
                <div className="flex gap-1.5 mt-1 flex-wrap">
                  <Badge variant="outline" className="text-[9px]">{selectedType?.label}</Badge>
                  <Badge variant="outline" className="text-[9px]">📍 {cities.get(cityId) || "?"}</Badge>
                </div>
              </div>
            </div>
            {description && (
              <p className="text-xs text-muted-foreground bg-muted/10 p-2 rounded">{description}</p>
            )}
            <div className="text-[10px] text-muted-foreground space-y-1">
              <p>• Svaz začíná s rozpočtem <strong>50 zlatých</strong></p>
              <p>• Skauting, výchova mládeže a trénink na úrovni 1</p>
              <p>• Můžete zakládat týmy ve svých městech</p>
            </div>
          </div>
        )}

        <DialogFooter className="flex justify-between gap-2 sm:justify-between">
          {step > 0 ? (
            <Button variant="outline" size="sm" onClick={() => setStep(s => s - 1)} className="gap-1">
              <ChevronLeft className="h-3 w-3" /> Zpět
            </Button>
          ) : <div />}
          {step < 2 ? (
            <Button size="sm" onClick={() => setStep(s => s + 1)} disabled={step === 0 && !name.trim()} className="gap-1">
              Další <ChevronRight className="h-3 w-3" />
            </Button>
          ) : (
            <Button size="sm" onClick={handleCreate} disabled={creating || !cityId || !name.trim()} className="gap-1">
              {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Založit svaz
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateAssociationDialog;
