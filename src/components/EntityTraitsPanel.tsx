import { useState } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollText, Plus, Trash2, Crown, Castle, Users, Swords, MapPin, Sparkles, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

type City = Tables<"cities">;
type GameEvent = Tables<"game_events">;

interface EntityTrait {
  id: string;
  session_id: string;
  entity_type: string;
  entity_name: string;
  entity_id: string | null;
  trait_category: string;
  trait_text: string;
  source_event_id: string | null;
  source_turn: number;
  is_active: boolean;
  created_at: string;
}

const ENTITY_TYPES = [
  { value: "ruler", label: "Vládce", icon: <Crown className="h-3 w-3" /> },
  { value: "city", label: "Město", icon: <Castle className="h-3 w-3" /> },
  { value: "person", label: "Osoba", icon: <Users className="h-3 w-3" /> },
  { value: "army", label: "Armáda", icon: <Swords className="h-3 w-3" /> },
  { value: "province", label: "Provincie", icon: <MapPin className="h-3 w-3" /> },
];

const TRAIT_CATEGORIES = [
  { value: "epithet", label: "Přídomek" },
  { value: "title", label: "Titul" },
  { value: "reputation", label: "Pověst" },
  { value: "characteristic", label: "Vlastnost" },
  { value: "relation", label: "Vztah" },
  { value: "history", label: "Historický fakt" },
];

const ENTITY_TYPE_ICONS: Record<string, React.ReactNode> = {
  ruler: <Crown className="h-4 w-4 text-illuminated" />,
  city: <Castle className="h-4 w-4 text-illuminated" />,
  person: <Users className="h-4 w-4 text-illuminated" />,
  army: <Swords className="h-4 w-4 text-illuminated" />,
  province: <MapPin className="h-4 w-4 text-illuminated" />,
};

const CATEGORY_COLORS: Record<string, string> = {
  epithet: "bg-primary/10 text-primary border-primary/20",
  title: "bg-primary/10 text-primary border-primary/20",
  reputation: "bg-muted text-foreground border-border",
  characteristic: "bg-muted text-foreground border-border",
  relation: "bg-muted text-foreground border-border",
  history: "bg-muted text-foreground border-border",
};

interface EntityTraitsPanelProps {
  sessionId: string;
  traits: EntityTrait[];
  cities: City[];
  events: GameEvent[];
  players: string[];
  currentTurn: number;
  onRefetch?: () => void;
}

const EntityTraitsPanel = ({
  sessionId, traits, cities, events, players, currentTurn, onRefetch,
}: EntityTraitsPanelProps) => {
  const [showAdd, setShowAdd] = useState(false);
  const [entityType, setEntityType] = useState("ruler");
  const [entityName, setEntityName] = useState("");
  const [traitCategory, setTraitCategory] = useState("characteristic");
  const [traitText, setTraitText] = useState("");
  const [filterType, setFilterType] = useState("__all__");
  const [filterEntity, setFilterEntity] = useState("");
  const [generatingTraits, setGeneratingTraits] = useState(false);

  const handleAdd = async () => {
    if (!entityName.trim() || !traitText.trim()) {
      toast.error("Vyplňte jméno entity a vlastnost");
      return;
    }

    const entityId = entityType === "city"
      ? cities.find(c => c.name === entityName)?.id || null
      : null;

    const { error } = await supabase.from("entity_traits").insert({
      session_id: sessionId,
      entity_type: entityType,
      entity_name: entityName.trim(),
      entity_id: entityId,
      trait_category: traitCategory,
      trait_text: traitText.trim(),
      source_turn: currentTurn,
    } as any);

    if (error) {
      toast.error("Nepodařilo se přidat vlastnost");
      console.error(error);
      return;
    }
    toast.success("Vlastnost přidána");
    setEntityName("");
    setTraitText("");
    setShowAdd(false);
    onRefetch?.();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("entity_traits").delete().eq("id", id);
    toast.success("Vlastnost odstraněna");
    onRefetch?.();
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    await supabase.from("entity_traits").update({ is_active: !currentActive } as any).eq("id", id);
    onRefetch?.();
  };

  const handleAIExtract = async () => {
    const confirmedEvents = events.filter(e => e.confirmed && e.turn_number <= currentTurn);
    if (confirmedEvents.length === 0) {
      toast.error("Žádné potvrzené události k analýze");
      return;
    }

    setGeneratingTraits(true);
    try {
      const { data, error } = await supabase.functions.invoke("extract-traits", {
        body: {
          events: confirmedEvents.slice(-30),
          existingTraits: traits.filter(t => t.is_active),
          players,
          cities: cities.map(c => ({ name: c.name, owner: c.owner_player, level: c.level })),
        },
      });

      if (error) throw error;

      const newTraits = data?.traits || [];
      if (newTraits.length === 0) {
        toast.info("AI nenašla nové vlastnosti");
      } else {
        for (const trait of newTraits) {
          await supabase.from("entity_traits").insert({
            session_id: sessionId,
            entity_type: trait.entity_type,
            entity_name: trait.entity_name,
            trait_category: trait.trait_category,
            trait_text: trait.trait_text,
            source_turn: currentTurn,
          } as any);
        }
        toast.success(`AI navrhla ${newTraits.length} nových vlastností`);
        onRefetch?.();
      }
    } catch {
      toast.error("AI extrakce selhala");
    }
    setGeneratingTraits(false);
  };

  // Filtering
  const filtered = traits.filter(t => {
    if (filterType !== "__all__" && t.entity_type !== filterType) return false;
    if (filterEntity && !t.entity_name.toLowerCase().includes(filterEntity.toLowerCase())) return false;
    return true;
  });

  // Group by entity
  const grouped = filtered.reduce<Record<string, EntityTrait[]>>((acc, t) => {
    const key = `${t.entity_type}::${t.entity_name}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  // Suggestions for entity name based on type
  const entitySuggestions = entityType === "city"
    ? cities.map(c => c.name)
    : entityType === "ruler"
      ? players
      : [];

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-decorative font-bold flex items-center gap-2">
          <ScrollText className="h-6 w-6 text-illuminated" />
          Vlastnosti světa
        </h1>
        <div className="flex gap-2">
          <Button
            onClick={handleAIExtract}
            disabled={generatingTraits}
            variant="outline"
            size="sm"
            className="font-display"
          >
            <Sparkles className="h-3 w-3 mr-1" />
            {generatingTraits ? "Analyzuji..." : "AI extrakce"}
          </Button>
          <Button onClick={() => setShowAdd(!showAdd)} size="sm" className="font-display">
            <Plus className="h-3 w-3 mr-1" />{showAdd ? "Zavřít" : "Přidat vlastnost"}
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Zaznamenávejte přídomky, pověsti, tituly a vlastnosti měst, vládců a dalších osob.
        Tyto údaje tvoří základ, ze kterého AI kronikář píše příběhy.
      </p>

      {/* Add form */}
      {showAdd && (
        <div className="manuscript-card p-4 space-y-3">
          <h3 className="font-display font-semibold text-sm">Nová vlastnost</h3>
          <div className="grid grid-cols-2 gap-2">
            <Select value={entityType} onValueChange={setEntityType}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ENTITY_TYPES.map(et => (
                  <SelectItem key={et.value} value={et.value}>
                    <span className="flex items-center gap-1">{et.icon}{et.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={traitCategory} onValueChange={setTraitCategory}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TRAIT_CATEGORIES.map(tc => (
                  <SelectItem key={tc.value} value={tc.value}>{tc.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {entitySuggestions.length > 0 ? (
            <Select value={entityName} onValueChange={setEntityName}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder={`Vyberte ${entityType === "city" ? "město" : "vládce"}...`} />
              </SelectTrigger>
              <SelectContent>
                {entitySuggestions.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              placeholder="Jméno entity (osoba, armáda...)"
              value={entityName}
              onChange={e => setEntityName(e.target.value)}
              className="h-9"
            />
          )}

          <Textarea
            placeholder='Např. "Krutý dobyvatel", "Město bude vždy věrné kočkám", "Spojenec Petry od roku 5"'
            value={traitText}
            onChange={e => setTraitText(e.target.value)}
            rows={2}
          />
          <Button onClick={handleAdd} size="sm" className="font-display">
            <Plus className="h-3 w-3 mr-1" />Přidat
          </Button>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-36 h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Všechny typy</SelectItem>
            {ENTITY_TYPES.map(et => (
              <SelectItem key={et.value} value={et.value}>{et.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Hledat entitu..."
          value={filterEntity}
          onChange={e => setFilterEntity(e.target.value)}
          className="h-9 flex-1 min-w-[150px]"
        />
      </div>

      {/* Entity groups */}
      {Object.keys(grouped).length === 0 ? (
        <div className="text-center py-12">
          <ScrollText className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-muted-foreground italic font-display">
            Zatím žádné zaznamenané vlastnosti. Přidejte první nebo nechte AI analyzovat události.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {Object.entries(grouped).map(([key, groupTraits]) => {
            const [type, name] = key.split("::");
            return (
              <div key={key} className="manuscript-card p-4">
                <div className="flex items-center gap-2 mb-3">
                  {ENTITY_TYPE_ICONS[type]}
                  <h3 className="font-display font-semibold">{name}</h3>
                  <Badge variant="outline" className="text-xs">
                    {ENTITY_TYPES.find(e => e.value === type)?.label}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {groupTraits.map(trait => (
                    <div
                      key={trait.id}
                      className={`flex items-start gap-2 p-2 rounded text-sm border ${
                        trait.is_active ? CATEGORY_COLORS[trait.trait_category] || "bg-muted" : "bg-muted/30 opacity-50"
                      }`}
                    >
                      <Badge variant="outline" className="text-xs shrink-0 mt-0.5">
                        {TRAIT_CATEGORIES.find(c => c.value === trait.trait_category)?.label || trait.trait_category}
                      </Badge>
                      <span className="flex-1">{trait.trait_text}</span>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => handleToggleActive(trait.id, trait.is_active)}
                          title={trait.is_active ? "Deaktivovat" : "Aktivovat"}
                        >
                          {trait.is_active ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-destructive"
                          onClick={() => handleDelete(trait.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <span className="text-xs text-muted-foreground mt-2 block">
                  Rok vzniku: {groupTraits[0]?.source_turn}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default EntityTraitsPanel;
