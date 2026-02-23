import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Sparkles, Globe, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  userId: string;
  playerName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (sessionId: string) => void;
}

const STEPS = [
  "Zakládám svět…",
  "Generuji civilizace a státy…",
  "Tvořím provincie a sídla…",
  "Osazuji osobnosti a divy…",
  "Zapisuji dějiny a bitvy…",
  "Šířím zvěsti po kraji…",
  "Dokončuji kroniku…",
];

export default function PromoWorldGenerator({ userId, playerName, open, onOpenChange, onCreated }: Props) {
  const [worldPrompt, setWorldPrompt] = useState("");
  const [nationPrompt, setNationPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [step, setStep] = useState(0);

  const handleGenerate = async () => {
    if (!worldPrompt.trim()) { toast.error("Zadejte popis světa"); return; }
    setGenerating(true);
    setStep(0);

    const interval = setInterval(() => {
      setStep(s => Math.min(s + 1, STEPS.length - 1));
    }, 5000);

    try {
      const { data, error } = await supabase.functions.invoke("generate-promo-world", {
        body: { worldPrompt, nationPrompt: nationPrompt || playerName, playerName, userId },
      });
      clearInterval(interval);
      if (error) throw error;
      if (data?.sessionId) {
        localStorage.setItem("ch_lastGameId", data.sessionId);
        toast.success("Svět byl vygenerován! 🏰");
        onCreated(data.sessionId);
      } else {
        throw new Error(data?.error || "Generování selhalo");
      }
    } catch (e: any) {
      clearInterval(interval);
      console.error("Promo world error:", e);
      toast.error("Generování selhalo: " + (e.message || "neznámá chyba").substring(0, 100));
    } finally {
      setGenerating(false);
      setStep(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={generating ? undefined : onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Sparkles className="h-5 w-5 text-primary" />
            Vygenerovat promo svět
          </DialogTitle>
          <DialogDescription>
            Kompletní svět s hlubokou prehistorií, 25 lety historie, legendami, bitvami, kronikou, zvěstmi a obrázky.
          </DialogDescription>
        </DialogHeader>

        {generating ? (
          <div className="space-y-4 py-8">
            <div className="flex items-center justify-center gap-3 text-primary">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="font-display text-lg">{STEPS[step]}</span>
            </div>
            <Progress value={(step + 1) / STEPS.length * 100} className="h-2" />
            <p className="text-sm text-muted-foreground text-center">
              Generování může trvat 30–90 sekund…
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Vize světa *</label>
              <Textarea
                placeholder="Popište svůj svět… (např. 'Temný středověký svět dvou znepřátelených království na pomezí pouště a lesů, plný intrik a válečných konfliktů')"
                value={worldPrompt}
                onChange={e => setWorldPrompt(e.target.value)}
                rows={3}
                className="text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Moje civilizace</label>
              <Textarea
                placeholder="Popište svůj národ… (např. 'Severské kmenové království zvyklé na tvrdé zimy, s tradicí runové magie')"
                value={nationPrompt}
                onChange={e => setNationPrompt(e.target.value)}
                rows={2}
                className="text-sm"
              />
            </div>

            <Button onClick={handleGenerate} className="w-full font-display" size="lg">
              <Globe className="mr-2 h-5 w-5" />
              Vygenerovat promo svět
            </Button>

            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              2 státy · 8 provincií · 24 sídel · 10+ osobností · 4 divy<br />
              10+ prehistorických legend · 20 událostí · 20 bitev · 40+ zvěstí<br />
              Kronika „Před počátkem paměti" · Lore Bible · Obrázky entit
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
