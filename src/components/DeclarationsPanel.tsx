import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Megaphone, Sparkles, ScrollText, Search, Filter, Plus, ChevronDown, ChevronUp,
  Eye, EyeOff, Lock, Send, Undo2, Trash2, Zap, Shield, BookOpen, X, Check,
} from "lucide-react";
import { toast } from "sonner";

// ============ CONSTANTS ============

const DECLARATION_TYPES = [
  { value: "war", label: "⚔️ Vyhlášení války", icon: "⚔️" },
  { value: "peace", label: "🕊️ Mírová proklamace", icon: "🕊️" },
  { value: "reform", label: "🔧 Reforma", icon: "🔧" },
  { value: "propaganda", label: "📢 Propaganda", icon: "📢" },
  { value: "founding_myth", label: "📜 Zakladatelský mýtus", icon: "📜" },
  { value: "trade_edict", label: "💰 Obchodní edikt", icon: "💰" },
  { value: "religious_edict", label: "🔮 Náboženský edikt", icon: "🔮" },
  { value: "threat", label: "💀 Výhrůžka", icon: "💀" },
  { value: "apology", label: "🤝 Omluva", icon: "🤝" },
  { value: "edict", label: "👑 Královský edikt", icon: "👑" },
  { value: "manifesto", label: "📋 Manifest", icon: "📋" },
];

const TYPE_LABELS: Record<string, string> = {
  war: "Vyhlášení války", peace: "Mírová proklamace", reform: "Reforma",
  propaganda: "Propaganda", founding_myth: "Zakladatelský mýtus",
  trade_edict: "Obchodní edikt", religious_edict: "Náboženský edikt",
  threat: "Výhrůžka", apology: "Omluva", edict: "Královský edikt",
  manifesto: "Manifest", proclamation: "Proklamace",
  war_declaration: "Vyhlášení války", peace_offer: "Mírová nabídka",
  peace_treaty: "Mírová smlouva", religious_reform: "Náboženská reforma",
};

const TONES = [
  { value: "Neutral", label: "😐 Neutrální" },
  { value: "Heroic", label: "🦁 Hrdinský" },
  { value: "Threatening", label: "💀 Výhružný" },
  { value: "Humble", label: "🙏 Pokorný" },
  { value: "Satirical", label: "🃏 Satirický" },
];

const VISIBILITIES = [
  { value: "PUBLIC", label: "Veřejné", icon: Eye },
  { value: "PRIVATE", label: "Soukromé", icon: EyeOff },
  { value: "LEAKABLE", label: "Únikové", icon: Lock },
];

const STATUS_LABELS: Record<string, string> = {
  draft: "Koncept", published: "Publikováno", revoked: "Odvoláno",
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  EMPIRE: "Říše", CITY: "Město", LEADER: "Vůdce", ARMY: "Armáda", PROVINCE: "Provincie",
};

interface TraitEffect {
  entity_type: string;
  entity_id: string | null;
  trait_key: string;
  trait_label: string;
  description: string;
  intensity: number;
  explanation?: string;
}

interface DeclarationsPanelProps {
  sessionId: string;
  currentPlayerName: string;
  declarations: any[];
  currentTurn: number;
  cities?: any[];
  players?: any[];
  events?: any[];
  memories?: any[];
  gameMode?: string;
  onRefetch?: () => void;
}

const DeclarationsPanel = ({
  sessionId, currentPlayerName, declarations, currentTurn,
  cities = [], players = [], events = [], memories = [],
  gameMode, onRefetch,
}: DeclarationsPanelProps) => {
  // Editor state
  const [showEditor, setShowEditor] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [type, setType] = useState("");
  const [tone, setTone] = useState("Neutral");
  const [visibility, setVisibility] = useState("PUBLIC");
  const [targetEmpires, setTargetEmpires] = useState<string[]>([]);
  const [targetCities, setTargetCities] = useState<string[]>([]);
  const [sourceNotes, setSourceNotes] = useState("");
  const [effects, setEffects] = useState<TraitEffect[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [suggestingEffects, setSuggestingEffects] = useState(false);

  // Existing declaration actions
  const [rewriting, setRewriting] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterPlayer, setFilterPlayer] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [sortField, setSortField] = useState<"turn" | "type" | "player">("turn");
  const [sortAsc, setSortAsc] = useState(false);

  // Player names from declarations + props
  const allPlayerNames = useMemo(() => {
    const names = new Set(declarations.map((d: any) => d.player_name));
    players.forEach((p: any) => names.add(p.player_name || p));
    return Array.from(names);
  }, [declarations, players]);

  // Filtered + sorted declarations
  const filteredDeclarations = useMemo(() => {
    let filtered = [...declarations];

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((d: any) =>
        (d.title || "").toLowerCase().includes(q) ||
        (d.original_text || "").toLowerCase().includes(q) ||
        (d.epic_text || "").toLowerCase().includes(q)
      );
    }

    // Filters
    if (filterType !== "all") filtered = filtered.filter((d: any) => d.declaration_type === filterType);
    if (filterPlayer !== "all") filtered = filtered.filter((d: any) => d.player_name === filterPlayer);
    if (filterStatus !== "all") filtered = filtered.filter((d: any) => (d.status || "published") === filterStatus);

    // Sort
    filtered.sort((a: any, b: any) => {
      let cmp = 0;
      if (sortField === "turn") cmp = (a.turn_number || 0) - (b.turn_number || 0);
      else if (sortField === "type") cmp = (a.declaration_type || "").localeCompare(b.declaration_type || "");
      else if (sortField === "player") cmp = (a.player_name || "").localeCompare(b.player_name || "");
      return sortAsc ? cmp : -cmp;
    });

    return filtered;
  }, [declarations, searchQuery, filterType, filterPlayer, filterStatus, sortField, sortAsc]);

  // ========== ACTIONS ==========

  const handleSubmit = async () => {
    if (!text.trim() || !type) { toast.error("Vyplňte text a typ vyhlášení"); return; }
    setSubmitting(true);
    try {
      const { data: inserted, error } = await supabase.from("declarations").insert({
        session_id: sessionId,
        player_name: currentPlayerName,
        declaration_type: type,
        original_text: text.trim(),
        turn_number: currentTurn,
        title: title.trim() || null,
        tone,
        target_empire_ids: targetEmpires,
        target_city_ids: targetCities,
        visibility,
        status: "published",
        ai_generated: false,
        source_notes: sourceNotes.trim() || null,
        effects: effects.length > 0 ? effects : [],
      } as any).select().single();

      if (error) throw error;

      // Apply effects as entity_traits
      if (effects.length > 0 && inserted) {
        for (const eff of effects) {
          await supabase.from("entity_traits").insert({
            session_id: sessionId,
            entity_type: eff.entity_type.toLowerCase(),
            entity_name: eff.trait_label,
            entity_id: eff.entity_id || null,
            trait_category: eff.trait_key,
            trait_text: eff.trait_label,
            description: eff.description,
            source_type: "Declaration",
            source_id: inserted.id,
            source_turn: currentTurn,
            intensity: eff.intensity,
            is_active: true,
          } as any);
        }
      }

      toast.success("📢 Vyhlášení publikováno!");
      
      // Trigger AI faction reactions in AI mode
      if (gameMode === "tb_single_ai" && inserted) {
        supabase.functions.invoke("declaration-ai-reactions", {
          body: {
            sessionId,
            declarationId: inserted.id,
            declarationText: text.trim(),
            declarationType: type || "proclamation",
            tone,
            playerName: currentPlayerName,
          },
        }).then(({ data }) => {
          if (data?.reactions?.length) {
            toast.info(`🏛️ ${data.reactions.length} AI frakcí zareagovalo na vaše vyhlášení`);
          }
        }).catch(() => {/* non-blocking */});
      }

      resetEditor();
      onRefetch?.();
    } catch (e: any) {
      toast.error("Chyba: " + (e?.message || "neznámá"));
    }
    setSubmitting(false);
  };

  const resetEditor = () => {
    setTitle(""); setText(""); setType(""); setTone("Neutral");
    setVisibility("PUBLIC"); setTargetEmpires([]); setTargetCities([]);
    setSourceNotes(""); setEffects([]); setShowEditor(false);
  };

  const handleSuggestEffects = async () => {
    if (!text.trim()) { toast.error("Nejdříve napište text vyhlášení"); return; }
    setSuggestingEffects(true);
    try {
      const myCities = cities.filter(c => c.owner_player === currentPlayerName);
      const recentEvts = events.filter(e => e.confirmed).slice(-20);
      const worldFacts = memories.filter(m => m.approved).map(m => m.text).slice(0, 15);

      const { data, error } = await supabase.functions.invoke("declaration-effects", {
        body: {
          declarationText: text.trim(),
          declarationType: type || "proclamation",
          tone,
          playerName: currentPlayerName,
          cities: myCities.map(c => ({ name: c.name, level: c.level })),
          recentEvents: recentEvts.map(e => ({ type: e.event_type, note: e.note, player: e.player })),
          worldFacts,
        },
      });

      if (error) throw error;
      if (data?.effects?.length) {
        setEffects(data.effects);
        toast.success(`✨ ${data.effects.length} rysů navrženo`);
      } else {
        toast.info("AI nenavrhl žádné rysy");
      }
    } catch (e: any) {
      toast.error("Návrh rysů selhal: " + (e?.message || ""));
    }
    setSuggestingEffects(false);
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
    } catch { toast.error("Přepis selhal"); }
    setRewriting(null);
  };

  const handleRevoke = async (declId: string) => {
    await supabase.from("declarations").update({ status: "revoked" } as any).eq("id", declId);
    toast.success("Vyhlášení odvoláno");
    onRefetch?.();
  };

  const removeEffect = (idx: number) => setEffects(prev => prev.filter((_, i) => i !== idx));

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) => (
    sortField === field ? (sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null
  );

  return (
    <div className="space-y-6 px-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-center flex-1 space-y-1">
          <h1 className="text-2xl font-decorative font-bold flex items-center justify-center gap-3">
            <Megaphone className="h-7 w-7 text-illuminated" />
            Vyhlášení a manifesty
          </h1>
          <p className="text-sm text-muted-foreground">
            Registr oficiálních vyhlášení ({declarations.length} celkem)
          </p>
        </div>
        <Button onClick={() => setShowEditor(!showEditor)} className="font-display">
          {showEditor ? <X className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
          {showEditor ? "Zavřít" : "Nové vyhlášení"}
        </Button>
      </div>

      {/* Editor */}
      {showEditor && (
        <div className="manuscript-card p-5 space-y-4 border-2 border-primary/30">
          <h3 className="font-display font-semibold flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-primary" />
            Nové vyhlášení
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input placeholder="Název vyhlášení (volitelné)..." value={title} onChange={e => setTitle(e.target.value)} />
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue placeholder="Typ vyhlášení..." /></SelectTrigger>
              <SelectContent>
                {DECLARATION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger><SelectValue placeholder="Tón..." /></SelectTrigger>
              <SelectContent>
                {TONES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={visibility} onValueChange={setVisibility}>
              <SelectTrigger><SelectValue placeholder="Viditelnost..." /></SelectTrigger>
              <SelectContent>
                {VISIBILITIES.map(v => <SelectItem key={v.value} value={v.value}>
                  <span className="flex items-center gap-1"><v.icon className="h-3 w-3" />{v.label}</span>
                </SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Textarea placeholder="Text vašeho vyhlášení..." value={text} onChange={e => setText(e.target.value)} rows={4} />

          <Input placeholder="Poznámky ke zdroji (volitelné)..." value={sourceNotes} onChange={e => setSourceNotes(e.target.value)} />

          {/* Target selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground font-display mb-1 block">Cílové říše</label>
              <div className="flex flex-wrap gap-1">
                {allPlayerNames.filter(n => n !== currentPlayerName).map(name => (
                  <Badge key={name} variant={targetEmpires.includes(name) ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => setTargetEmpires(prev =>
                      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
                    )}>
                    {name}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-display mb-1 block">Cílová města</label>
              <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                {cities.slice(0, 20).map(c => (
                  <Badge key={c.id} variant={targetCities.includes(c.id) ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => setTargetCities(prev =>
                      prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id]
                    )}>
                    {c.name}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {/* AI Effects */}
          <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/20">
            <div className="flex items-center justify-between">
              <h4 className="font-display font-semibold text-sm flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                Dopady vyhlášení (rysy)
              </h4>
              <Button size="sm" variant="outline" onClick={handleSuggestEffects}
                disabled={suggestingEffects || !text.trim()} className="text-xs">
                <Sparkles className="h-3 w-3 mr-1" />
                {suggestingEffects ? "Navrhuji..." : "✨ Navrhnout dopady z AI"}
              </Button>
            </div>

            {effects.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                Žádné dopady. Klikněte na „Navrhnout dopady" pro AI návrhy.
              </p>
            )}

            {effects.map((eff, i) => (
              <div key={i} className="flex items-start gap-2 p-2 rounded border border-border bg-card text-sm">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-xs">
                      {ENTITY_TYPE_LABELS[eff.entity_type] || eff.entity_type}
                    </Badge>
                    <span className="font-display font-semibold">{eff.trait_label}</span>
                    <Badge variant="outline" className="text-xs">síla {eff.intensity}/5</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{eff.description}</p>
                  {eff.explanation && <p className="text-xs italic text-muted-foreground/70 mt-0.5">↳ {eff.explanation}</p>}
                </div>
                <Button size="sm" variant="ghost" onClick={() => removeEffect(i)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={submitting || !text.trim() || !type} className="flex-1 font-display">
              <Send className="h-4 w-4 mr-1" />
              {submitting ? "Publikuji..." : "📢 Publikovat vyhlášení"}
            </Button>
            <Button variant="outline" onClick={resetEditor}>Zrušit</Button>
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <div className="manuscript-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Hledat v textu vyhlášení..." value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)} className="pl-8" />
          </div>
          <Filter className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Typ..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Všechny typy</SelectItem>
              {DECLARATION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterPlayer} onValueChange={setFilterPlayer}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Hráč..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Všichni hráči</SelectItem>
              {allPlayerNames.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Status..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Všechny statusy</SelectItem>
              <SelectItem value="draft">Koncept</SelectItem>
              <SelectItem value="published">Publikováno</SelectItem>
              <SelectItem value="revoked">Odvoláno</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table Header */}
      <div className="hidden md:grid grid-cols-[60px_120px_1fr_100px_90px_80px] gap-2 px-3 py-2 text-xs font-display font-semibold text-muted-foreground border-b border-border">
        <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("turn")}>
          Rok <SortIcon field="turn" />
        </button>
        <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("player")}>
          Autor <SortIcon field="player" />
        </button>
        <span>Název / Text</span>
        <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("type")}>
          Typ <SortIcon field="type" />
        </button>
        <span>Viditelnost</span>
        <span>Status</span>
      </div>

      {/* Declarations List */}
      <ScrollArea className="max-h-[60vh]">
        <div className="space-y-2">
          {filteredDeclarations.length === 0 && (
            <p className="text-xs text-muted-foreground italic text-center py-8">
              {searchQuery ? "Žádné výsledky pro tento hledaný výraz." : "Žádná vyhlášení."}
            </p>
          )}

          {filteredDeclarations.map((d: any) => {
            const isExpanded = expandedId === d.id;
            const isOwner = d.player_name === currentPlayerName;
            const declEffects: TraitEffect[] = d.effects || [];
            const status = d.status || "published";

            return (
              <div key={d.id} className={`manuscript-card p-3 space-y-2 cursor-pointer transition-all
                ${status === "revoked" ? "opacity-50" : ""} ${isExpanded ? "ring-2 ring-primary/30" : ""}`}
                onClick={() => setExpandedId(isExpanded ? null : d.id)}>

                {/* Row summary */}
                <div className="grid grid-cols-1 md:grid-cols-[60px_120px_1fr_100px_90px_80px] gap-2 items-center">
                  <span className="text-xs font-mono text-muted-foreground">Rok {d.turn_number}</span>
                  <span className="font-display font-semibold text-sm">{d.player_name}</span>
                  <div className="truncate">
                    {d.title && <span className="font-display font-semibold text-sm mr-2">{d.title}</span>}
                    <span className="text-xs text-muted-foreground">{(d.original_text || "").slice(0, 80)}...</span>
                  </div>
                  <Badge variant="secondary" className="text-xs w-fit">
                    {TYPE_LABELS[d.declaration_type] || d.declaration_type}
                  </Badge>
                  <Badge variant="outline" className="text-xs w-fit">
                    {d.visibility === "PRIVATE" ? "🔒" : d.visibility === "LEAKABLE" ? "🔓" : "👁️"} {d.visibility || "PUBLIC"}
                  </Badge>
                  <Badge variant={status === "published" ? "default" : status === "revoked" ? "destructive" : "outline"}
                    className="text-xs w-fit">
                    {STATUS_LABELS[status] || status}
                  </Badge>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="space-y-3 pt-2 border-t border-border" onClick={e => e.stopPropagation()}>
                    {/* Full text */}
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{d.original_text}</p>
                    </div>

                    {/* Tone & targets */}
                    <div className="flex flex-wrap gap-2 text-xs">
                      {d.tone && d.tone !== "Neutral" && (
                        <Badge variant="outline">Tón: {d.tone}</Badge>
                      )}
                      {(d.target_empire_ids || []).map((t: string) => (
                        <Badge key={t} variant="outline" className="text-xs">🎯 {t}</Badge>
                      ))}
                      {d.source_notes && (
                        <span className="text-muted-foreground italic">📝 {d.source_notes}</span>
                      )}
                    </div>

                    {/* Epic rewrite */}
                    {d.epic_text && (
                      <div className="p-3 rounded bg-muted/40 border border-border">
                        <p className="text-xs text-muted-foreground mb-1 font-display flex items-center gap-1">
                          <ScrollText className="h-3 w-3" /> Kronikářova verze:
                        </p>
                        <p className="text-sm italic leading-relaxed whitespace-pre-wrap">{d.epic_text}</p>
                      </div>
                    )}

                    {/* Effects / Traits */}
                    {declEffects.length > 0 && (
                      <div className="border border-border rounded-lg p-3 space-y-1 bg-muted/10">
                        <h4 className="font-display text-xs font-semibold flex items-center gap-1">
                          <Shield className="h-3 w-3 text-primary" /> Dopady ({declEffects.length} rysů)
                        </h4>
                        {declEffects.map((eff: TraitEffect, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <Badge variant="secondary" className="text-xs">
                              {ENTITY_TYPE_LABELS[eff.entity_type] || eff.entity_type}
                            </Badge>
                            <span className="font-semibold">{eff.trait_label}</span>
                            <Badge variant="outline" className="text-xs">síla {eff.intensity}/5</Badge>
                            <span className="text-muted-foreground">{eff.description}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Owner actions */}
                    {isOwner && (
                      <div className="flex gap-2 flex-wrap">
                        {!d.epic_text && (
                          <Button size="sm" variant="outline" onClick={() => handleRewrite(d.id, d.original_text)}
                            disabled={rewriting === d.id} className="text-xs">
                            <Sparkles className="mr-1 h-3 w-3" />
                            {rewriting === d.id ? "Přepisuji..." : "Přepsat kronikářem"}
                          </Button>
                        )}
                        {status === "published" && (
                          <Button size="sm" variant="destructive" onClick={() => handleRevoke(d.id)} className="text-xs">
                            <Undo2 className="mr-1 h-3 w-3" /> Odvolat
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};

export default DeclarationsPanel;
