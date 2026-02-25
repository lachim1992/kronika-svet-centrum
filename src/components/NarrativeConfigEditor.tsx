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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollText, Save, Loader2, Sparkles, BookOpen, Building2, User, Swords } from "lucide-react";
import { toast } from "sonner";

interface EntityTypeConfig {
  enabled: boolean;
  style_prompt: string;
  tone: string;
  max_length: string;
  keywords: string[];
  forbidden: string[];
  sections: string[];
}

const DEFAULT_ENTITY_CONFIG: EntityTypeConfig = {
  enabled: true,
  style_prompt: "",
  tone: "encyklopedický",
  max_length: "8-15 vět",
  keywords: [],
  forbidden: [],
  sections: [],
};

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
  entity_types: {
    city: EntityTypeConfig;
    person: EntityTypeConfig;
    event: EntityTypeConfig;
  };
  enrichment: {
    auto_enrich: boolean;
    impact_threshold: number;
    min_events_for_trigger: number;
    trigger_types: string[];
  };
}

const DEFAULT_NARRATIVE: NarrativeConfig = {
  saga: { enabled: true, style_prompt: "", stance: "pro-regime", keywords: [], forbidden: [] },
  history: { enabled: true, style_prompt: "", include_metrics: true },
  entity_types: {
    city: { ...DEFAULT_ENTITY_CONFIG, tone: "encyklopedický", sections: ["geografie", "kultura", "ekonomika", "demografie", "historie"] },
    person: { ...DEFAULT_ENTITY_CONFIG, tone: "biografický", sections: ["původ", "činy", "odkaz", "vztahy"] },
    event: { ...DEFAULT_ENTITY_CONFIG, tone: "historický", sections: ["příčiny", "průběh", "důsledky", "účastníci"] },
  },
  enrichment: {
    auto_enrich: true,
    impact_threshold: 3,
    min_events_for_trigger: 3,
    trigger_types: ["battle", "uprising", "founding", "conquest", "wonder_built", "famine", "disaster"],
  },
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
  // Per-entity text fields
  const [entityKeywords, setEntityKeywords] = useState<Record<string, string>>({ city: "", person: "", event: "" });
  const [entityForbidden, setEntityForbidden] = useState<Record<string, string>>({ city: "", person: "", event: "" });
  const [triggerTypesText, setTriggerTypesText] = useState("");

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
        entity_types: {
          city: { ...DEFAULT_NARRATIVE.entity_types.city, ...narrative.entity_types?.city },
          person: { ...DEFAULT_NARRATIVE.entity_types.person, ...narrative.entity_types?.person },
          event: { ...DEFAULT_NARRATIVE.entity_types.event, ...narrative.entity_types?.event },
        },
        enrichment: { ...DEFAULT_NARRATIVE.enrichment, ...narrative.enrichment },
      };
      setConfig(merged);
      setKeywordsText((merged.saga.keywords || []).join(", "));
      setForbiddenText((merged.saga.forbidden || []).join(", "));
      setEntityKeywords({
        city: (merged.entity_types.city.keywords || []).join(", "),
        person: (merged.entity_types.person.keywords || []).join(", "),
        event: (merged.entity_types.event.keywords || []).join(", "),
      });
      setEntityForbidden({
        city: (merged.entity_types.city.forbidden || []).join(", "),
        person: (merged.entity_types.person.forbidden || []).join(", "),
        event: (merged.entity_types.event.forbidden || []).join(", "),
      });
      setTriggerTypesText((merged.enrichment.trigger_types || []).join(", "));
      setLoading(false);
    };
    load();
  }, [sessionId]);

  const parseCSV = (text: string) => text.split(",").map(s => s.trim()).filter(Boolean);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updatedConfig: NarrativeConfig = {
        ...config,
        saga: { ...config.saga, keywords: parseCSV(keywordsText), forbidden: parseCSV(forbiddenText) },
        entity_types: {
          city: { ...config.entity_types.city, keywords: parseCSV(entityKeywords.city), forbidden: parseCSV(entityForbidden.city) },
          person: { ...config.entity_types.person, keywords: parseCSV(entityKeywords.person), forbidden: parseCSV(entityForbidden.person) },
          event: { ...config.entity_types.event, keywords: parseCSV(entityKeywords.event), forbidden: parseCSV(entityForbidden.event) },
        },
        enrichment: { ...config.enrichment, trigger_types: parseCSV(triggerTypesText) },
      };

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

  const renderEntityTypeTab = (key: "city" | "person" | "event", label: string, icon: React.ReactNode) => {
    const cfg = config.entity_types[key];
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">{icon} {label}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Switch checked={cfg.enabled} onCheckedChange={v => setConfig(c => ({
              ...c, entity_types: { ...c.entity_types, [key]: { ...c.entity_types[key], enabled: v } }
            }))} disabled={disabled} />
            <span className="text-sm">Povoleno</span>
          </div>
          <div>
            <Label className="text-xs">Tón</Label>
            <Select value={cfg.tone} onValueChange={v => setConfig(c => ({
              ...c, entity_types: { ...c.entity_types, [key]: { ...c.entity_types[key], tone: v } }
            }))} disabled={disabled}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="encyklopedický">Encyklopedický</SelectItem>
                <SelectItem value="biografický">Biografický</SelectItem>
                <SelectItem value="historický">Historický</SelectItem>
                <SelectItem value="mýtický">Mýtický</SelectItem>
                <SelectItem value="kronikářský">Kronikářský</SelectItem>
                <SelectItem value="politický">Politický</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Délka článku</Label>
            <Select value={cfg.max_length} onValueChange={v => setConfig(c => ({
              ...c, entity_types: { ...c.entity_types, [key]: { ...c.entity_types[key], max_length: v } }
            }))} disabled={disabled}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="4-6 vět">Krátký (4-6 vět)</SelectItem>
                <SelectItem value="8-15 vět">Střední (8-15 vět)</SelectItem>
                <SelectItem value="15-25 vět">Dlouhý (15-25 vět)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Stylový prompt</Label>
            <Textarea
              value={cfg.style_prompt}
              onChange={e => setConfig(c => ({
                ...c, entity_types: { ...c.entity_types, [key]: { ...c.entity_types[key], style_prompt: e.target.value } }
              }))}
              disabled={disabled} rows={2} className="text-xs"
              placeholder={`Např.: Piš jako dvorní kronikář, zdůrazni politické aspekty…`}
            />
          </div>
          <div>
            <Label className="text-xs">Klíčová slova</Label>
            <Input value={entityKeywords[key]} onChange={e => setEntityKeywords(p => ({ ...p, [key]: e.target.value }))}
              disabled={disabled} className="text-xs h-8" placeholder="sláva, osud…" />
          </div>
          <div>
            <Label className="text-xs">Zakázaná slova</Label>
            <Input value={entityForbidden[key]} onChange={e => setEntityForbidden(p => ({ ...p, [key]: e.target.value }))}
              disabled={disabled} className="text-xs h-8" placeholder="moderní, technologie…" />
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ScrollText className="h-5 w-5 text-primary" />
        <h3 className="font-display font-bold text-base">Narativní konfigurace</h3>
        {readOnly && <Badge variant="outline" className="text-[10px] ml-auto">Pouze pro čtení</Badge>}
      </div>

      <Tabs defaultValue="saga" className="w-full">
        <TabsList className="w-full grid grid-cols-4 h-8">
          <TabsTrigger value="saga" className="text-xs">Sága</TabsTrigger>
          <TabsTrigger value="history" className="text-xs">Historie</TabsTrigger>
          <TabsTrigger value="entities" className="text-xs">Entity</TabsTrigger>
          <TabsTrigger value="enrichment" className="text-xs">Enrichment</TabsTrigger>
        </TabsList>

        {/* SAGA TAB */}
        <TabsContent value="saga">
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
                <Textarea value={config.saga.style_prompt} onChange={e => setConfig(c => ({ ...c, saga: { ...c.saga, style_prompt: e.target.value } }))}
                  disabled={disabled} rows={3} className="text-xs" placeholder="Např.: Piš ve stylu starověkých bardů…" />
              </div>
              <div>
                <Label className="text-xs">Klíčová slova</Label>
                <Input value={keywordsText} onChange={e => setKeywordsText(e.target.value)} disabled={disabled} className="text-xs h-8" placeholder="sláva, osud, krev…" />
              </div>
              <div>
                <Label className="text-xs">Zakázaná slova</Label>
                <Input value={forbiddenText} onChange={e => setForbiddenText(e.target.value)} disabled={disabled} className="text-xs h-8" placeholder="moderní, technologie…" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* HISTORY TAB */}
        <TabsContent value="history">
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
                <Textarea value={config.history.style_prompt} onChange={e => setConfig(c => ({ ...c, history: { ...c.history, style_prompt: e.target.value } }))}
                  disabled={disabled} rows={3} className="text-xs" placeholder="Např.: Piš akademickým stylem…" />
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={config.history.include_metrics} onCheckedChange={v => setConfig(c => ({ ...c, history: { ...c.history, include_metrics: v } }))} disabled={disabled} />
                <span className="text-sm">Zahrnout metriky (populace, stabilita…)</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ENTITY TYPES TAB */}
        <TabsContent value="entities">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {renderEntityTypeTab("city", "Města", <Building2 className="h-4 w-4" />)}
            {renderEntityTypeTab("person", "Osobnosti", <User className="h-4 w-4" />)}
            {renderEntityTypeTab("event", "Události/Bitvy", <Swords className="h-4 w-4" />)}
          </div>
        </TabsContent>

        {/* ENRICHMENT TAB */}
        <TabsContent value="enrichment">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> AI Enrichment (obohacení wiki)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Switch checked={config.enrichment.auto_enrich} onCheckedChange={v => setConfig(c => ({
                  ...c, enrichment: { ...c.enrichment, auto_enrich: v }
                }))} disabled={disabled} />
                <span className="text-sm">Automatické obohacení po splnění prahu</span>
              </div>
              <div>
                <Label className="text-xs">Minimální počet nových událostí pro trigger</Label>
                <Input type="number" value={config.enrichment.min_events_for_trigger}
                  onChange={e => setConfig(c => ({ ...c, enrichment: { ...c.enrichment, min_events_for_trigger: parseInt(e.target.value) || 3 } }))}
                  disabled={disabled} className="text-xs h-8 w-24" min={1} max={20} />
              </div>
              <div>
                <Label className="text-xs">Minimální impact skóre pro trigger</Label>
                <Input type="number" value={config.enrichment.impact_threshold}
                  onChange={e => setConfig(c => ({ ...c, enrichment: { ...c.enrichment, impact_threshold: parseInt(e.target.value) || 3 } }))}
                  disabled={disabled} className="text-xs h-8 w-24" min={1} max={20} />
              </div>
              <div>
                <Label className="text-xs">Typy událostí spouštějící enrichment (oddělené čárkou)</Label>
                <Input value={triggerTypesText} onChange={e => setTriggerTypesText(e.target.value)}
                  disabled={disabled} className="text-xs h-8"
                  placeholder="battle, uprising, founding, conquest, wonder_built, famine, disaster" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
