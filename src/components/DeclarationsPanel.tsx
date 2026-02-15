import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Megaphone, Sparkles, ScrollText } from "lucide-react";
import { toast } from "sonner";

const DECLARATION_TYPES = [
  { value: "war", label: "⚔️ Vyhlášení války" },
  { value: "founding_myth", label: "📜 Zakladatelský mýtus" },
  { value: "religious_reform", label: "🔮 Náboženská reforma" },
  { value: "propaganda", label: "📢 Propagandistická kampaň" },
  { value: "peace_treaty", label: "🕊️ Mírová smlouva" },
  { value: "edict", label: "👑 Královský edikt" },
  { value: "manifesto", label: "📋 Manifest" },
];

const TYPE_LABELS: Record<string, string> = {
  war: "Vyhlášení války", founding_myth: "Zakladatelský mýtus", religious_reform: "Náboženská reforma",
  propaganda: "Propaganda", peace_treaty: "Mírová smlouva", edict: "Královský edikt", manifesto: "Manifest",
};

interface DeclarationsPanelProps {
  sessionId: string;
  currentPlayerName: string;
  declarations: any[];
  currentTurn: number;
  onRefetch?: () => void;
}

const DeclarationsPanel = ({ sessionId, currentPlayerName, declarations, currentTurn, onRefetch }: DeclarationsPanelProps) => {
  const [text, setText] = useState("");
  const [type, setType] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [rewriting, setRewriting] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!text.trim() || !type) { toast.error("Vyplňte text a typ vyhlášení"); return; }
    setSubmitting(true);
    await supabase.from("declarations").insert({
      session_id: sessionId, player_name: currentPlayerName,
      declaration_type: type, original_text: text.trim(), turn_number: currentTurn,
    });
    toast.success("Vyhlášení zapsáno do dějin!");
    setText(""); setType("");
    onRefetch?.();
    setSubmitting(false);
  };

  const handleRewrite = async (declId: string, originalText: string) => {
    setRewriting(declId);
    try {
      const { data, error } = await supabase.functions.invoke("declaration-rewrite", {
        body: { text: originalText },
      });
      if (error) throw error;
      if (data?.epicText) {
        await supabase.from("declarations").update({ epic_text: data.epicText }).eq("id", declId);
        toast.success("Vyhlášení přepsáno kronikářem!");
        onRefetch?.();
      }
    } catch {
      toast.error("Přepis selhal");
    }
    setRewriting(null);
  };

  return (
    <div className="space-y-6 px-4">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-decorative font-bold flex items-center justify-center gap-3">
          <Megaphone className="h-7 w-7 text-illuminated" />
          Vyhlášení a manifesty
        </h1>
        <p className="text-sm text-muted-foreground">Oficiální prohlášení vaší říše</p>
      </div>

      <div className="manuscript-card p-5 space-y-3">
        <h3 className="font-display font-semibold text-sm">Nové vyhlášení</h3>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger><SelectValue placeholder="Typ vyhlášení..." /></SelectTrigger>
          <SelectContent>
            {DECLARATION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Textarea placeholder="Text vašeho vyhlášení..." value={text} onChange={e => setText(e.target.value)} rows={3} />
        <Button onClick={handleSubmit} disabled={submitting} className="w-full font-display">
          {submitting ? "Zapisuji..." : "📢 Vyhlásit"}
        </Button>
      </div>

      <div className="space-y-3 max-h-[50vh] overflow-y-auto">
        {declarations.length === 0 && (
          <p className="text-xs text-muted-foreground italic text-center py-6">Žádná vyhlášení.</p>
        )}
        {[...declarations].reverse().map((d: any) => (
          <div key={d.id} className="manuscript-card p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">{TYPE_LABELS[d.declaration_type] || d.declaration_type}</Badge>
                <span className="font-display font-semibold text-sm">{d.player_name}</span>
                <span className="text-xs text-muted-foreground">Rok {d.turn_number}</span>
              </div>
            </div>
            <p className="text-sm">{d.original_text}</p>
            {d.epic_text && (
              <div className="p-3 rounded bg-muted/40 border border-border mt-2">
                <p className="text-xs text-muted-foreground mb-1 font-display flex items-center gap-1">
                  <ScrollText className="h-3 w-3" /> Kronikářova verze:
                </p>
                <p className="text-sm italic leading-relaxed whitespace-pre-wrap">{d.epic_text}</p>
              </div>
            )}
            {!d.epic_text && d.player_name === currentPlayerName && (
              <Button size="sm" variant="outline" onClick={() => handleRewrite(d.id, d.original_text)}
                disabled={rewriting === d.id} className="text-xs">
                <Sparkles className="mr-1 h-3 w-3" />
                {rewriting === d.id ? "Přepisuji..." : "Přepsat kronikářem"}
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default DeclarationsPanel;
