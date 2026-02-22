import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollText, Save, Loader2, Sparkles, BookOpen } from "lucide-react";
import { toast } from "sonner";

export interface NarrativeConfig {
  saga: {
    enabled: boolean;
    style_prompt: string;
    stance: string;
    keywords: string[];
    forbidden: string[];
  };
  history: {
    enabled: boolean;
    style_prompt: string;
    include_metrics: boolean;
  };
}

const DEFAULT_NARRATIVE: NarrativeConfig = {
  saga: { enabled: true, style_prompt: "", stance: "pro-regime", keywords: [], forbidden: [] },
  history: { enabled: true, style_prompt: "", include_metrics: true },
};

interface Props {
  sessionId: string;
  myRole: string;
  readOnly?: boolean;
}

const NarrativeConfigEditor = ({ sessionId, myRole, readOnly = false }: Props) => {
  const [config, setConfig] = useState<NarrativeConfig>(DEFAULT_NARRATIVE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keywordsText, setKeywordsText] = useState("");
  const [forbiddenText, setForbiddenText] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("server_config" as any)
        .select("economic_params")
        .eq("session_id", sessionId)
        .maybeSingle();
      const econ = (data as any)?.economic_params || {};
      const narrative = econ.narrative || {};
      const merged: NarrativeConfig = {
        saga: { ...DEFAULT_NARRATIVE.saga, ...narrative.saga },
        history: { ...DEFAULT_NARRATIVE.history, ...narrative.history },
      };
      setConfig(merged);
      setKeywordsText((merged.saga.keywords || []).join(", "));
      setForbiddenText((merged.saga.forbidden || []).join(", "));
      setLoading(false);
    };
    load();
  }, [sessionId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Parse keywords
      const keywords = keywordsText.split(",").map(s => s.trim()).filter(Boolean);
      const forbidden = forbiddenText.split(",").map(s => s.trim()).filter(Boolean);
      const updatedConfig = {
        ...config,
        saga: { ...config.saga, keywords, forbidden },
      };

      // Read current economic_params, merge narrative in
      const { data: current } = await supabase
        .from("server_config" as any)
        .select("id, economic_params")
        .eq("session_id", sessionId)
        .maybeSingle();

      if (!current) {
        toast.error("Server config neexistuje — inicializujte svět.");
        setSaving(false);
        return;
      }

      const existingEcon = (current as any).economic_params || {};
      const newEcon = { ...existingEcon, narrative: updatedConfig };

      await supabase
        .from("server_config" as any)
        .update({ economic_params: newEcon } as any)
        .eq("id", (current as any).id);

      setConfig(updatedConfig);
      toast.success("Narativní konfigurace uložena");
    } catch (e) {
      console.error(e);
      toast.error("Uložení selhalo");
    }
    setSaving(false);
  };

  if (loading) return <p className="text-sm text-muted-foreground">Načítání narativní konfigurace…</p>;

  const isAdmin = myRole === "admin";
  const disabled = readOnly || !isAdmin;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ScrollText className="h-5 w-5 text-primary" />
        <h3 className="font-display font-bold text-base">Narativní konfigurace</h3>
        {readOnly && <Badge variant="outline" className="text-[10px] ml-auto">Pouze pro čtení</Badge>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* SAGA CONFIG */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> Sága (dvorní kronika)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <Switch checked={config.saga.enabled} onCheckedChange={v => setConfig(c => ({ ...c, saga: { ...c.saga, enabled: v } }))} disabled={disabled} />
              <span className="text-sm">Ságy povoleny</span>
            </div>
            <div>
              <Label className="text-xs">Postoj kronikáře</Label>
              <Select value={config.saga.stance} onValueChange={v => setConfig(c => ({ ...c, saga: { ...c.saga, stance: v } }))} disabled={disabled}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pro-regime">Pro-režimní</SelectItem>
                  <SelectItem value="neutral">Neutrální</SelectItem>
                  <SelectItem value="critical">Kritický</SelectItem>
                  <SelectItem value="mythical">Mýtický</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Stylový prompt pro ságu</Label>
              <Textarea
                value={config.saga.style_prompt}
                onChange={e => setConfig(c => ({ ...c, saga: { ...c.saga, style_prompt: e.target.value } }))}
                disabled={disabled}
                rows={3}
                className="text-xs"
                placeholder="Např.: Piš ve stylu starověkých bardů, používej archaický jazyk…"
              />
            </div>
            <div>
              <Label className="text-xs">Klíčová slova (oddělená čárkou)</Label>
              <Input value={keywordsText} onChange={e => setKeywordsText(e.target.value)} disabled={disabled} className="text-xs h-8" placeholder="sláva, osud, krev…" />
            </div>
            <div>
              <Label className="text-xs">Zakázaná slova (oddělená čárkou)</Label>
              <Input value={forbiddenText} onChange={e => setForbiddenText(e.target.value)} disabled={disabled} className="text-xs h-8" placeholder="moderní, technologie…" />
            </div>
          </CardContent>
        </Card>

        {/* HISTORY CONFIG */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BookOpen className="h-4 w-4" /> Historie (encyklopedie)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <Switch checked={config.history.enabled} onCheckedChange={v => setConfig(c => ({ ...c, history: { ...c.history, enabled: v } }))} disabled={disabled} />
              <span className="text-sm">Historické syntézy povoleny</span>
            </div>
            <div>
              <Label className="text-xs">Stylový prompt pro historii</Label>
              <Textarea
                value={config.history.style_prompt}
                onChange={e => setConfig(c => ({ ...c, history: { ...c.history, style_prompt: e.target.value } }))}
                disabled={disabled}
                rows={3}
                className="text-xs"
                placeholder="Např.: Piš akademickým stylem, cituj zdroje…"
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={config.history.include_metrics} onCheckedChange={v => setConfig(c => ({ ...c, history: { ...c.history, include_metrics: v } }))} disabled={disabled} />
              <span className="text-sm">Zahrnout metriky (populace, stabilita…)</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {!disabled && (
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Uložit narativní konfiguraci
        </Button>
      )}
    </div>
  );
};

export default NarrativeConfigEditor;
