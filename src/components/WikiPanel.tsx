import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookOpen, Sparkles, Loader2, ImageIcon, Search, MapPin, Landmark, Star, Castle, Swords } from "lucide-react";
import { toast } from "sonner";

interface WikiPanelProps {
  sessionId: string;
  currentPlayerName: string;
  cities: any[];
  wonders: any[];
  greatPersons: any[];
  events: any[];
  onRefetch?: () => void;
}

interface WikiEntry {
  id: string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string;
  owner_player: string;
  summary: string | null;
  ai_description: string | null;
  image_url: string | null;
  image_prompt: string | null;
  tags: string[];
  updated_at: string;
}

const ENTITY_ICONS: Record<string, React.ReactNode> = {
  city: <MapPin className="h-4 w-4" />,
  wonder: <Landmark className="h-4 w-4" />,
  person: <Star className="h-4 w-4" />,
  battle: <Swords className="h-4 w-4" />,
  province: <Castle className="h-4 w-4" />,
};

const ENTITY_LABELS: Record<string, string> = {
  city: "Město", wonder: "Div světa", person: "Osobnost", battle: "Bitva", province: "Provincie",
};

const WikiPanel = ({ sessionId, currentPlayerName, cities, wonders, greatPersons, events, onRefetch }: WikiPanelProps) => {
  const [entries, setEntries] = useState<WikiEntry[]>([]);
  const [filter, setFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<WikiEntry | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  useEffect(() => {
    fetchEntries();
  }, [sessionId]);

  const fetchEntries = async () => {
    const { data } = await supabase
      .from("wiki_entries")
      .select("*")
      .eq("session_id", sessionId)
      .order("entity_type")
      .order("entity_name");
    if (data) setEntries(data as WikiEntry[]);
  };

  const generateWikiEntry = async (entityType: string, entityName: string, entityId: string | null, ownerPlayer: string, context: any) => {
    const key = `${entityType}-${entityId || entityName}`;
    setGeneratingId(key);
    try {
      const { data, error } = await supabase.functions.invoke("wiki-generate", {
        body: { entityType, entityName, entityId, sessionId, ownerPlayer, context },
      });
      if (error) throw error;
      if (data.error) { toast.error(data.error); return; }

      // Upsert locally
      const existing = entries.find(e => e.entity_name === entityName && e.entity_type === entityType);
      if (existing) {
        await supabase.from("wiki_entries").update({
          summary: data.summary,
          ai_description: data.aiDescription,
          image_url: data.imageUrl,
          image_prompt: data.imagePrompt,
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        await supabase.from("wiki_entries").insert({
          session_id: sessionId,
          entity_type: entityType,
          entity_id: entityId,
          entity_name: entityName,
          owner_player: ownerPlayer,
          summary: data.summary,
          ai_description: data.aiDescription,
          image_url: data.imageUrl,
          image_prompt: data.imagePrompt,
        });
      }

      await fetchEntries();
      toast.success(`📖 Wiki článek „${entityName}" vygenerován!`);
    } catch (e) {
      console.error(e);
      toast.error("Generování wiki článku selhalo");
    }
    setGeneratingId(null);
  };

  // Build potential entities that can have wiki entries
  const potentialEntities = [
    ...cities.map(c => ({ type: "city", name: c.name, id: c.id, owner: c.owner_player, context: { level: c.level, province: c.province, tags: c.tags } })),
    ...wonders.map(w => ({ type: "wonder", name: w.name, id: w.id, owner: w.owner_player, context: { era: w.era, status: w.status, city: w.city_name, description: w.description } })),
    ...greatPersons.map(p => ({ type: "person", name: p.name, id: p.id, owner: p.player_name, context: { personType: p.person_type, flavor: p.flavor_trait, alive: p.is_alive } })),
  ];

  const filtered = potentialEntities.filter(e => {
    if (typeFilter && e.type !== typeFilter) return false;
    if (filter && !e.name.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  const getWikiEntry = (type: string, name: string) => entries.find(e => e.entity_type === type && e.entity_name === name);

  return (
    <div className="space-y-6 px-4">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-decorative font-bold flex items-center justify-center gap-3">
          <BookOpen className="h-7 w-7 text-illuminated" />
          Encyklopedie světa
        </h1>
        <p className="text-sm text-muted-foreground">Wiki všech entit — měst, divů, osobností a bitev</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Hledat..." value={filter} onChange={e => setFilter(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant={typeFilter === null ? "default" : "outline"} onClick={() => setTypeFilter(null)} className="text-xs">Vše</Button>
          {Object.entries(ENTITY_LABELS).map(([key, label]) => (
            <Button key={key} size="sm" variant={typeFilter === key ? "default" : "outline"} onClick={() => setTypeFilter(key)} className="text-xs">
              {ENTITY_ICONS[key]}<span className="ml-1">{label}</span>
            </Button>
          ))}
        </div>
      </div>

      <div className="flex gap-4">
        {/* Entity list */}
        <ScrollArea className="flex-1 h-[600px]">
          <div className="space-y-2 pr-2">
            {filtered.map(entity => {
              const wiki = getWikiEntry(entity.type, entity.name);
              const isOwner = entity.owner === currentPlayerName;
              const key = `${entity.type}-${entity.id || entity.name}`;
              const isGen = generatingId === key;

              return (
                <div
                  key={key}
                  className={`manuscript-card p-3 cursor-pointer hover:border-primary/50 transition-colors ${selectedEntry?.entity_name === entity.name && selectedEntry?.entity_type === entity.type ? "border-primary" : ""}`}
                  onClick={() => wiki && setSelectedEntry(wiki)}
                >
                  <div className="flex items-center gap-3">
                    {/* Thumbnail */}
                    <div className="shrink-0 w-12 h-12 rounded overflow-hidden border border-border bg-muted/30">
                      {wiki?.image_url ? (
                        <img src={wiki.image_url} alt={entity.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          {ENTITY_ICONS[entity.type] || <ImageIcon className="h-5 w-5 text-muted-foreground/30" />}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-display font-semibold text-sm truncate">{entity.name}</span>
                        <Badge variant="outline" className="text-xs shrink-0">{ENTITY_LABELS[entity.type]}</Badge>
                        {wiki && <Badge variant="secondary" className="text-xs shrink-0">📖</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {wiki?.summary || `${entity.owner} — dosud nezapsáno`}
                      </p>
                    </div>

                    {isOwner && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isGen}
                        onClick={(e) => {
                          e.stopPropagation();
                          generateWikiEntry(entity.type, entity.name, entity.id, entity.owner, entity.context);
                        }}
                      >
                        {isGen ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-8 italic">Žádné entity nenalezeny</p>
            )}
          </div>
        </ScrollArea>

        {/* Detail panel */}
        {selectedEntry && (
          <div className="w-[400px] shrink-0 manuscript-card p-5 space-y-4 h-fit sticky top-20">
            {selectedEntry.image_url && (
              <img src={selectedEntry.image_url} alt={selectedEntry.entity_name} className="w-full h-48 object-cover rounded-md" />
            )}
            <div>
              <div className="flex items-center gap-2 mb-2">
                {ENTITY_ICONS[selectedEntry.entity_type]}
                <h2 className="font-display font-bold text-lg">{selectedEntry.entity_name}</h2>
              </div>
              <Badge variant="outline" className="text-xs mb-3">{ENTITY_LABELS[selectedEntry.entity_type]} — {selectedEntry.owner_player}</Badge>
            </div>
            {selectedEntry.summary && (
              <p className="text-sm font-semibold text-primary">{selectedEntry.summary}</p>
            )}
            {selectedEntry.ai_description && (
              <p className="text-sm leading-relaxed text-muted-foreground italic">{selectedEntry.ai_description}</p>
            )}
            <p className="text-xs text-muted-foreground">Aktualizováno: {new Date(selectedEntry.updated_at).toLocaleString("cs")}</p>
            <Button size="sm" variant="ghost" onClick={() => setSelectedEntry(null)} className="text-xs">Zavřít</Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default WikiPanel;
