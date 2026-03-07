import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollText, Plus, Loader2, Gavel, X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
  myRole: string;
}

const EFFECT_TYPES = [
  { value: "tax_change", label: "Změna daní (stabilita)", icon: "💰", hint: "Kladná = vyšší daně (−stabilita), záporná = nižší (+stabilita)" },
  { value: "tax_rate_percent", label: "Daňová sazba (% zlata)", icon: "🪙", hint: "Modifikátor příjmu zlata v %. +10 = +10% zlata" },
  { value: "grain_ration_modifier", label: "Potravinový příděl", icon: "🌾", hint: "Modifikátor spotřeby obilí v %. −10 = úsporný, +15 = štědrý" },
  { value: "trade_restriction", label: "Obchodní omezení", icon: "🚫", hint: "Penalizace efektivity obchodu v %. +20 = −20% příjmu z obchodu" },
  { value: "active_pop_modifier", label: "Pracovní povinnost", icon: "👷", hint: "Modifikátor podílu aktivní populace. +0.05 = +5% pracujících" },
  { value: "military_funding", label: "Vojenské financování", icon: "⚔️", hint: "Zvyšuje morálku armád" },
  { value: "civil_reform", label: "Občanská reforma", icon: "🏛️", hint: "Zvyšuje stabilitu měst" },
  { value: "max_mobilization_modifier", label: "Odvodová povinnost", icon: "🛡️", hint: "Modifikátor max mobilizace. +0.05 = +5% mobilizace" },
];

const LawsPanel = ({ sessionId, currentPlayerName, currentTurn, myRole }: Props) => {
  const [laws, setLaws] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [lawName, setLawName] = useState("");
  const [fullText, setFullText] = useState("");
  const [effects, setEffects] = useState<{ type: string; value: number }[]>([]);
  const [processing, setProcessing] = useState(false);

  const fetchLaws = async () => {
    const { data } = await supabase
      .from("laws")
      .select("*")
      .eq("session_id", sessionId)
      .order("enacted_turn", { ascending: false });
    setLaws(data || []);
  };

  useEffect(() => { fetchLaws(); }, [sessionId]);

  const addEffect = () => {
    setEffects(prev => [...prev, { type: "tax_change", value: 1 }]);
  };

  const removeEffect = (idx: number) => {
    setEffects(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!lawName.trim()) { toast.error("Zadejte název zákona"); return; }
    if (!fullText.trim()) { toast.error("Zadejte text zákona"); return; }
    if (effects.length === 0) { toast.error("Přidejte alespoň jeden efekt"); return; }

    setProcessing(true);
    try {
      // 1. Save the law with structured effects
      const { error: insertError } = await supabase.from("laws").insert({
        session_id: sessionId,
        player_name: currentPlayerName,
        law_name: lawName.trim(),
        full_text: fullText.trim(),
        structured_effects: effects,
        enacted_turn: currentTurn,
      });

      if (insertError) throw insertError;

      // 2. Try AI epic rewrite (non-blocking)
      try {
        const { data: aiData } = await supabase.functions.invoke("law-process", {
          body: {
            lawName: lawName.trim(),
            fullText: fullText.trim(),
            effects,
            playerName: currentPlayerName,
            sessionId,
          },
        });

        if (aiData?.epicText) {
          // Update the law with AI epic text
          await supabase.from("laws")
            .update({ ai_epic_text: aiData.epicText })
            .eq("session_id", sessionId)
            .eq("law_name", lawName.trim())
            .eq("player_name", currentPlayerName)
            .eq("enacted_turn", currentTurn);
        }
      } catch (e) {
        console.warn("AI law rewrite failed (non-critical):", e);
      }

      // 3. Log to world action log
      await supabase.from("world_action_log").insert({
        session_id: sessionId,
        player_name: currentPlayerName,
        turn_number: currentTurn,
        action_type: "other",
        description: `${currentPlayerName} vyhlásil zákon: ${lawName.trim()}`,
      });

      toast.success("Zákon vyhlášen!");
      setShowForm(false);
      setLawName("");
      setFullText("");
      setEffects([]);
      fetchLaws();
    } catch (e: any) {
      toast.error(e.message || "Chyba při vyhlášení zákona");
    } finally {
      setProcessing(false);
    }
  };

  const handleRepeal = async (lawId: string, name: string) => {
    await supabase.from("laws").update({
      is_active: false,
      repealed_turn: currentTurn,
    }).eq("id", lawId);

    await supabase.from("world_action_log").insert({
      session_id: sessionId,
      player_name: currentPlayerName,
      turn_number: currentTurn,
      action_type: "other",
      description: `${currentPlayerName} zrušil zákon: ${name}`,
    });

    toast.success("Zákon zrušen.");
    fetchLaws();
  };

  const myLaws = laws.filter(l => l.player_name === currentPlayerName);
  const otherLaws = laws.filter(l => l.player_name !== currentPlayerName);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-primary" />
          <h3 className="font-display font-semibold text-base">Zákony</h3>
        </div>
        <Button size="sm" variant="outline" className="font-display text-xs" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-3 w-3 mr-1" />{showForm ? "Zrušit" : "Nový zákon"}
        </Button>
      </div>

      {/* ─── Create Law Form ─── */}
      {showForm && (
        <div className="game-card p-4 space-y-4 border-primary/30">
          <h4 className="font-display font-semibold text-sm flex items-center gap-2">
            <Gavel className="h-4 w-4 text-primary" />Vyhlásit zákon
          </h4>

          <Input
            placeholder="Název zákona (např. Daňová reforma)"
            value={lawName}
            onChange={e => setLawName(e.target.value)}
            className="font-display"
          />

          <Textarea
            placeholder="Volný text zákona — popište záměr, důvody, znění…"
            value={fullText}
            onChange={e => setFullText(e.target.value)}
            rows={4}
          />

          {/* Structured Effects */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">Efekty</span>
              <Button size="sm" variant="ghost" onClick={addEffect} className="text-xs h-7">
                <Plus className="h-3 w-3 mr-1" />Přidat efekt
              </Button>
            </div>
            <div className="space-y-2">
              {effects.map((eff, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Select value={eff.type} onValueChange={v => {
                    const copy = [...effects];
                    copy[idx].type = v;
                    setEffects(copy);
                  }}>
                    <SelectTrigger className="flex-1 h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EFFECT_TYPES.map(et => (
                        <SelectItem key={et.value} value={et.value} title={et.hint}>
                          {et.icon} {et.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    value={eff.value}
                    onChange={e => {
                      const copy = [...effects];
                      copy[idx].value = Number(e.target.value);
                      setEffects(copy);
                    }}
                    className="w-20 h-9 text-xs"
                    placeholder="Síla"
                  />
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeEffect(idx)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              {effects.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Přidejte efekty (daně, vojsko, reformy…)</p>
              )}
            </div>
          </div>

          <Button onClick={handleSubmit} disabled={processing} className="w-full font-display">
            {processing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Zpracovávám…</> : "Vyhlásit zákon"}
          </Button>
        </div>
      )}

      {/* ─── My Laws ─── */}
      {myLaws.length > 0 && (
        <section>
          <h4 className="font-display font-semibold text-sm mb-2">Moje zákony</h4>
          <div className="space-y-2">
            {myLaws.map(law => (
              <LawCard key={law.id} law={law} canRepeal onRepeal={() => handleRepeal(law.id, law.law_name)} />
            ))}
          </div>
        </section>
      )}

      {/* ─── Other Laws ─── */}
      {otherLaws.length > 0 && (
        <section>
          <h4 className="font-display font-semibold text-sm mb-2">Zákony ostatních</h4>
          <div className="space-y-2">
            {otherLaws.map(law => (
              <LawCard key={law.id} law={law} canRepeal={false} />
            ))}
          </div>
        </section>
      )}

      {laws.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground italic text-center py-6">
          Žádné zákony nebyly dosud vyhlášeny.
        </p>
      )}
    </div>
  );
};

function LawCard({ law, canRepeal, onRepeal }: { law: any; canRepeal: boolean; onRepeal?: () => void }) {
  const effects = Array.isArray(law.structured_effects) ? law.structured_effects : [];
  const effectLabels: Record<string, string> = {
    tax_change: "💰 Daně", tax_rate_percent: "🪙 Daň%", grain_ration_modifier: "🌾 Příděl",
    trade_restriction: "🚫 Obchod", active_pop_modifier: "👷 Práce", military_funding: "⚔️ Vojsko",
    civil_reform: "🏛️ Reforma", max_mobilization_modifier: "🛡️ Odvody",
  };

  return (
    <div className={`game-card p-3 ${!law.is_active ? "opacity-50" : ""}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-primary" />
          <span className="font-display font-semibold text-sm">{law.law_name}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={law.is_active ? "default" : "secondary"} className="text-[9px]">
            {law.is_active ? "Aktivní" : `Zrušen (rok ${law.repealed_turn})`}
          </Badge>
          <span className="text-[10px] text-muted-foreground">Rok {law.enacted_turn}</span>
        </div>
      </div>

      {law.ai_epic_text ? (
        <p className="text-xs italic text-muted-foreground mt-1 mb-2">{law.ai_epic_text}</p>
      ) : (
        <p className="text-xs text-muted-foreground mt-1 mb-2 line-clamp-2">{law.full_text}</p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-muted-foreground">{law.player_name}</span>
        {effects.map((e: any, i: number) => (
          <Badge key={i} variant="outline" className="text-[9px]">
            {effectLabels[e.type] || e.type}: {e.value > 0 ? "+" : ""}{e.value}
          </Badge>
        ))}
        {canRepeal && law.is_active && onRepeal && (
          <Button size="sm" variant="ghost" className="text-[10px] h-6 ml-auto text-destructive" onClick={onRepeal}>
            Zrušit
          </Button>
        )}
      </div>
    </div>
  );
}

export default LawsPanel;
