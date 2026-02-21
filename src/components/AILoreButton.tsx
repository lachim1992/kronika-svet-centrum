import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface AILoreButtonProps {
  sessionId: string;
  loreType: "city_lore" | "artifact" | "region_summary" | "war_outcome" | "faction_lore" | "custom";
  context: Record<string, any>;
  label: string;
  compact?: boolean;
}

const LORE_TYPE_PROMPTS: Record<string, string> = {
  city_lore: "Vygeneruj bohatý popis a historii města na základě kontextu. Vrať 2-3 odstavce narativního textu.",
  artifact: "Vygeneruj popis legendárního artefaktu — jeho původ, sílu a legendu. Vrať 2-3 odstavce.",
  region_summary: "Vytvoř geografický a kulturní souhrn regionu. Vrať 2-3 odstavce.",
  war_outcome: "Popiš výsledek vojenského konfliktu — průběh bitvy, ztráty, následky. Vrať 2-3 odstavce.",
  faction_lore: "Vytvoř kulturní profil frakce — tradice, víra, politický systém, zvyky. Vrať 2-3 odstavce.",
  custom: "Vygeneruj narativní text na základě zadání hráče.",
};

const AILoreButton = ({ sessionId, loreType, context, label, compact }: AILoreButtonProps) => {
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [showInput, setShowInput] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("ai-lore-generate", {
        body: {
          sessionId,
          loreType,
          context,
          customPrompt: loreType === "custom" ? customPrompt : undefined,
        },
      });

      if (error) throw error;
      setResult(data?.text || "AI kronikář selhal...");
    } catch (e) {
      console.error("Lore generation error:", e);
      toast.error("Generování selhalo");
    }
    setGenerating(false);
  };

  const handleCopy = () => {
    if (result) {
      navigator.clipboard.writeText(result);
      setCopied(true);
      toast.success("Zkopírováno");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (result) {
    return (
      <div className="space-y-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-xs">
            <Sparkles className="h-3 w-3 mr-1" />AI Lore
          </Badge>
          <Button variant="ghost" size="sm" onClick={handleCopy}>
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </Button>
        </div>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{result}</p>
        <Button variant="outline" size="sm" onClick={() => setResult(null)} className="text-xs">
          Zavřít
        </Button>
      </div>
    );
  }

  if (loreType === "custom" && showInput) {
    return (
      <div className="space-y-2 p-3 bg-muted/30 border border-border rounded-lg">
        <Textarea
          value={customPrompt}
          onChange={e => setCustomPrompt(e.target.value)}
          placeholder="Popište, co chcete vygenerovat..."
          rows={2}
          className="text-sm"
        />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowInput(false)} className="text-xs">
            Zrušit
          </Button>
          <Button size="sm" onClick={handleGenerate} disabled={generating || !customPrompt.trim()} className="text-xs">
            {generating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
            Generovat
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size={compact ? "sm" : "default"}
      onClick={loreType === "custom" ? () => setShowInput(true) : handleGenerate}
      disabled={generating}
      className={compact ? "text-xs" : ""}
    >
      {generating ? (
        <Loader2 className="h-3 w-3 animate-spin mr-1" />
      ) : (
        <Sparkles className="h-3 w-3 mr-1 text-primary" />
      )}
      {generating ? "Generuji..." : label}
    </Button>
  );
};

export default AILoreButton;
