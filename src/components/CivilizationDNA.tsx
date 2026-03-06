import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Crown, Save, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import CivIdentityPreview from "./CivIdentityPreview";

interface CivilizationDNAProps {
  sessionId: string;
  playerName: string;
  civilizations: any[];
  onRefetch?: () => void;
}

const CivilizationDNA = ({ sessionId, playerName, civilizations, onRefetch }: CivilizationDNAProps) => {
  const myCiv = civilizations.find((c: any) => c.player_name === playerName);
  const [civName, setCivName] = useState(myCiv?.civ_name || "");
  const [civDescription, setCivDescription] = useState(myCiv?.core_myth || "");
  const [saving, setSaving] = useState(false);
  const [identityData, setIdentityData] = useState<any>(null);
  const [identityLoading, setIdentityLoading] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);

  useEffect(() => {
    if (myCiv) {
      setCivName(myCiv.civ_name || "");
      setCivDescription(myCiv.core_myth || "");
    }
  }, [myCiv]);

  // Load existing civ_identity
  useEffect(() => {
    const loadIdentity = async () => {
      const { data } = await supabase
        .from("civ_identity")
        .select("*")
        .eq("session_id", sessionId)
        .eq("player_name", playerName)
        .maybeSingle();
      if (data) setIdentityData(data);
    };
    loadIdentity();
  }, [sessionId, playerName]);

  const handleExtract = async () => {
    if (!civDescription.trim()) {
      toast.error("Zadejte popis civilizace");
      return;
    }
    setIdentityLoading(true);
    setIdentityError(null);
    try {
      const { data, error } = await supabase.functions.invoke("extract-civ-identity", {
        body: {
          sessionId,
          playerName: playerName.trim(),
          civDescription: civDescription.trim(),
        },
      });
      if (error) throw new Error(typeof error === "string" ? error : error.message);
      if (data?.ai_error) throw new Error(data.ai_error);
      setIdentityData(data);
      toast.success("AI identita extrahována!");
      onRefetch?.();
    } catch (e: any) {
      setIdentityError(e.message || "Neznámá chyba");
      toast.error("Extrakce selhala: " + (e.message || ""));
    } finally {
      setIdentityLoading(false);
    }
  };

  const handleSave = async () => {
    if (!civName.trim()) { toast.error("Zadejte název civilizace"); return; }
    setSaving(true);

    if (myCiv) {
      await supabase.from("civilizations").update({
        civ_name: civName,
        core_myth: civDescription || null,
      }).eq("id", myCiv.id);
    } else {
      await supabase.from("civilizations").insert({
        session_id: sessionId,
        player_name: playerName,
        civ_name: civName,
        core_myth: civDescription || null,
      });
    }
    toast.success("Civilizace uložena");
    onRefetch?.();
    setSaving(false);
  };

  const otherCivs = civilizations.filter((c: any) => c.player_name !== playerName);

  return (
    <div className="space-y-6 px-4">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-decorative font-bold flex items-center justify-center gap-3">
          <Crown className="h-7 w-7 text-illuminated" />
          Identita civilizace
        </h1>
        <p className="text-sm text-muted-foreground">Definujte DNA vašeho národa — AI vygeneruje kompletní sadu modifikátorů</p>
      </div>

      <div className="manuscript-card p-5 space-y-4">
        <h3 className="font-display font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-illuminated" />
          Vaše civilizace — {playerName}
        </h3>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-display text-muted-foreground">Název národa</label>
            <Input value={civName} onChange={e => setCivName(e.target.value)} placeholder="např. Kapkianové" className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-display text-muted-foreground">Popis civilizace (pro AI extrakci)</label>
            <Textarea
              value={civDescription}
              onChange={e => setCivDescription(e.target.value)}
              placeholder="Popište svůj národ — bojovníci, obchodníci, námořníci? AI z toho vygeneruje modifikátory."
              rows={3}
              className="mt-1"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving} variant="outline" className="flex-1">
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Ukládám..." : "Uložit"}
          </Button>
          <Button onClick={handleExtract} disabled={identityLoading} className="flex-1">
            {identityLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {identityLoading ? "Analyzuji..." : "AI Extrakce"}
          </Button>
        </div>
      </div>

      {/* Identity preview (reuses the same component as wizard) */}
      {(identityData || identityLoading || identityError) && (
        <div className="manuscript-card p-5">
          <CivIdentityPreview
            sessionId={sessionId}
            playerName={playerName}
            civDescription={civDescription}
            identityData={identityData}
            loading={identityLoading}
            error={identityError}
            onExtract={handleExtract}
            onBack={() => {}}
            onConfirm={() => {}}
          />
        </div>
      )}

      {otherCivs.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-display font-semibold text-sm">Ostatní civilizace</h3>
          {otherCivs.map((c: any) => (
            <div key={c.id} className="manuscript-card p-4 space-y-2">
              <p className="font-display font-bold text-sm">{c.civ_name} <span className="text-muted-foreground font-normal">({c.player_name})</span></p>
              {c.core_myth && <p className="text-xs text-muted-foreground italic">📜 {c.core_myth}</p>}
              {c.cultural_quirk && <p className="text-xs text-muted-foreground">🎭 {c.cultural_quirk}</p>}
              {c.architectural_style && <p className="text-xs text-muted-foreground">🏛️ {c.architectural_style}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CivilizationDNA;
