import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Scroll, Sparkles, RefreshCw, CheckCircle2, MessageSquare,
  Swords, Shield, Handshake, Landmark, MapPin, Send, Eye, EyeOff, Lock,
} from "lucide-react";
import { toast } from "sonner";

type GameEvent = Tables<"game_events">;
type City = Tables<"cities">;
type WorldMemory = Tables<"world_memories">;

interface EventAnnotation {
  id: string;
  event_id: string;
  author: string;
  note_text: string;
  visibility: string;
  created_at: string;
}

interface EventNarrative {
  id: string;
  event_id: string;
  narrative_text: string;
  key_quotes: string[];
  epoch_style: string;
  version: number;
  is_canon: boolean;
  created_at: string;
}

const EVENT_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  battle: { label: "BITVA", icon: <Swords className="h-4 w-4" /> },
  raid: { label: "NÁJEZD", icon: <Shield className="h-4 w-4" /> },
  diplomacy: { label: "DIPLOMACIE", icon: <Handshake className="h-4 w-4" /> },
  wonder: { label: "DIV", icon: <Landmark className="h-4 w-4" /> },
  trade: { label: "OBCHOD", icon: <Handshake className="h-4 w-4" /> },
  place_tile: { label: "DÍLEK", icon: <MapPin className="h-4 w-4" /> },
  found_settlement: { label: "OSADA", icon: <MapPin className="h-4 w-4" /> },
  upgrade_city: { label: "UPGRADE", icon: <MapPin className="h-4 w-4" /> },
  repair: { label: "OPRAVA", icon: <Shield className="h-4 w-4" /> },
  city_state_action: { label: "MĚSTSKÝ STÁT", icon: <MapPin className="h-4 w-4" /> },
  declaration: { label: "VYHLÁŠENÍ", icon: <Scroll className="h-4 w-4" /> },
};

const VISIBILITY_ICONS: Record<string, React.ReactNode> = {
  public: <Eye className="h-3 w-3" />,
  private: <EyeOff className="h-3 w-3" />,
  leakable: <Lock className="h-3 w-3" />,
};

interface EventDetailModalProps {
  event: GameEvent | null;
  open: boolean;
  onClose: () => void;
  cities: City[];
  memories: WorldMemory[];
  currentPlayerName: string;
  epochStyle: string;
}

const EventDetailModal = ({
  event, open, onClose, cities, memories, currentPlayerName, epochStyle,
}: EventDetailModalProps) => {
  const [annotations, setAnnotations] = useState<EventAnnotation[]>([]);
  const [narratives, setNarratives] = useState<EventNarrative[]>([]);
  const [newNote, setNewNote] = useState("");
  const [noteVisibility, setNoteVisibility] = useState("public");
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!event || !open) return;
    fetchDetails();
  }, [event?.id, open]);

  const fetchDetails = async () => {
    if (!event) return;
    const [annRes, narRes] = await Promise.all([
      supabase.from("event_annotations").select("*").eq("event_id", event.id).order("created_at", { ascending: true }),
      supabase.from("event_narratives").select("*").eq("event_id", event.id).order("version", { ascending: false }),
    ]);
    if (annRes.data) setAnnotations(annRes.data as EventAnnotation[]);
    if (narRes.data) setNarratives(narRes.data as EventNarrative[]);
  };

  const handleAddNote = async () => {
    if (!newNote.trim() || !event) return;
    setSubmitting(true);
    const { error } = await supabase.from("event_annotations").insert({
      event_id: event.id,
      author: currentPlayerName,
      note_text: newNote.trim(),
      visibility: noteVisibility,
    });
    if (error) {
      toast.error("Nepodařilo se uložit poznámku");
    } else {
      toast.success("Poznámka přidána");
      setNewNote("");
      await fetchDetails();
    }
    setSubmitting(false);
  };

  const handleGenerateNarrative = async () => {
    if (!event) return;
    setGenerating(true);
    try {
      const cityMemories = memories
        .filter(m => m.approved && m.city_id === (event as any).city_id)
        .map(m => m.text);

      const worldFacts = memories
        .filter(m => m.approved && !m.city_id)
        .map(m => m.text);

      const { data, error } = await supabase.functions.invoke("event-narrative", {
        body: {
          event,
          cityMemories,
          notes: annotations.filter(a => a.visibility !== "private" || a.author === currentPlayerName),
          epochStyle,
          worldFacts,
        },
      });

      if (error) throw error;

      const nextVersion = narratives.length > 0 ? narratives[0].version + 1 : 1;

      await supabase.from("event_narratives").insert({
        event_id: event.id,
        narrative_text: data.narrativeText,
        key_quotes: data.keyQuotes || [],
        epoch_style: epochStyle,
        version: nextVersion,
      });

      toast.success("Narativ vygenerován!");
      await fetchDetails();
    } catch (e) {
      toast.error("Generování selhalo");
      console.error(e);
    }
    setGenerating(false);
  };

  const handleConfirmCanon = async (narrativeId: string) => {
    const { error } = await supabase.from("event_narratives")
      .update({ is_canon: true })
      .eq("id", narrativeId);
    if (error) {
      toast.error("Nepodařilo se potvrdit");
    } else {
      toast.success("✅ Potvrzeno jako oficiální zápis kroniky!");
      await fetchDetails();
    }
  };

  if (!event) return null;

  const isEventOwner = event.player === currentPlayerName;
  const eventInfo = EVENT_LABELS[event.event_type] || { label: event.event_type.toUpperCase(), icon: <Scroll className="h-4 w-4" /> };
  const eventCity = cities.find(c => c.id === (event as any).city_id);
  const attackerCity = cities.find(c => c.id === (event as any).attacker_city_id);
  const defenderCity = cities.find(c => c.id === (event as any).defender_city_id);
  const latestNarrative = narratives.find(n => n.is_canon) || narratives[0];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Scroll className="h-5 w-5 text-primary" />
            📜 Detail události
          </DialogTitle>
        </DialogHeader>

        {/* A) Event Header */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="default" className="gap-1">
              {eventInfo.icon} {eventInfo.label}
            </Badge>
            <Badge variant="secondary">Rok {event.turn_number}</Badge>
            {event.location && (
              <Badge variant="outline" className="gap-1">
                <MapPin className="h-3 w-3" /> {event.location}
              </Badge>
            )}
            {eventCity && (
              <Badge variant="outline">{eventCity.name}</Badge>
            )}
          </div>
          <div className="text-sm">
            <span className="font-semibold">{event.player}</span>
            {event.note && <span className="text-muted-foreground italic ml-2">— „{event.note}"</span>}
          </div>

          {/* Structured fields by event type */}
          {event.event_type === "battle" && (
            <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1 border">
              <p className="font-display font-semibold text-xs uppercase text-muted-foreground">Bitevní zpráva</p>
              {attackerCity && <p>⚔️ Útočník: <span className="font-semibold">{attackerCity.name}</span></p>}
              {defenderCity && <p>🛡️ Obránce: <span className="font-semibold">{defenderCity.name}</span></p>}
              {(event as any).armies_involved?.length > 0 && (
                <p>🪖 Armády: {(event as any).armies_involved.join(", ")}</p>
              )}
              {(event as any).result && <p>📊 Výsledek: <span className="font-semibold">{(event as any).result}</span></p>}
              {(event as any).casualties && <p>💀 Ztráty: {(event as any).casualties}</p>}
            </div>
          )}

          {event.event_type === "raid" && (
            <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1 border">
              <p className="font-display font-semibold text-xs uppercase text-muted-foreground">Zpráva o nájezdu</p>
              {event.location && <p>🎯 Cíl: {event.location}</p>}
              {(event as any).devastation_duration && (
                <p>🔥 Devastace: {(event as any).devastation_duration} kol</p>
              )}
            </div>
          )}

          {event.event_type === "diplomacy" && (
            <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1 border">
              <p className="font-display font-semibold text-xs uppercase text-muted-foreground">Diplomatický dokument</p>
              {(event as any).treaty_type && <p>📋 Typ smlouvy: {(event as any).treaty_type}</p>}
              {(event as any).terms_summary && <p>📝 Podmínky: {(event as any).terms_summary}</p>}
            </div>
          )}

          {event.event_type === "wonder" && (
            <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1 border">
              <p className="font-display font-semibold text-xs uppercase text-muted-foreground">Div světa</p>
              {eventCity && <p>🏛️ Město: {eventCity.name}</p>}
            </div>
          )}
        </div>

        {/* B) Annotations Thread */}
        <div className="space-y-3 mt-4">
          <h3 className="font-display font-semibold flex items-center gap-2 text-sm">
            <MessageSquare className="h-4 w-4 text-primary" />
            💬 Poznámky k události ({annotations.length})
          </h3>

          {annotations.length > 0 && (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {annotations
                .filter(a => a.visibility !== "private" || a.author === currentPlayerName)
                .map(a => (
                  <div key={a.id} className="pl-3 border-l-2 border-primary/20 text-sm">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{a.author}</span>
                      {VISIBILITY_ICONS[a.visibility]}
                      <span>{a.visibility === "private" ? "soukromé" : a.visibility === "leakable" ? "únikové" : ""}</span>
                      <span>• {new Date(a.created_at).toLocaleString("cs-CZ")}</span>
                    </div>
                    <p className="mt-0.5">{a.note_text}</p>
                  </div>
                ))}
            </div>
          )}

          <div className="flex gap-2">
            <Textarea
              placeholder="Přidat poznámku... (vtipný kontext, strategie, roleplay)"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              className="min-h-[60px] text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <Select value={noteVisibility} onValueChange={setNoteVisibility}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">👁️ Veřejná</SelectItem>
                <SelectItem value="private">🔒 Soukromá</SelectItem>
                <SelectItem value="leakable">💧 Úniková</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={handleAddNote} disabled={submitting || !newNote.trim()}>
              <Send className="h-3 w-3 mr-1" /> Odeslat
            </Button>
          </div>
        </div>

        {/* C+D) AI Narrative */}
        <div className="space-y-3 mt-4">
          <h3 className="font-display font-semibold flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            ✨ AI Narativ
          </h3>

          {latestNarrative ? (
            <div className={`p-4 rounded-lg border text-sm leading-relaxed ${
              latestNarrative.is_canon ? "border-primary bg-primary/5" : "border-border bg-card"
            }`}>
              {latestNarrative.is_canon && (
                <Badge variant="default" className="mb-2 gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Kanonický zápis
                </Badge>
              )}
              <p className="whitespace-pre-wrap">{latestNarrative.narrative_text}</p>
              {latestNarrative.key_quotes?.length > 0 && (
                <div className="mt-3 space-y-1">
                  {latestNarrative.key_quotes.map((q, i) => (
                    <p key={i} className="text-xs italic text-muted-foreground">💬 „{q}"</p>
                  ))}
                </div>
              )}
              <div className="text-xs text-muted-foreground mt-2">
                Verze {latestNarrative.version} • {latestNarrative.epoch_style}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">Žádný narativ zatím nebyl vygenerován.</p>
          )}

          {isEventOwner && (
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                onClick={handleGenerateNarrative}
                disabled={generating}
                variant={latestNarrative ? "outline" : "default"}
              >
                {latestNarrative ? (
                  <><RefreshCw className={`h-3 w-3 mr-1 ${generating ? "animate-spin" : ""}`} /> 🔄 Regenerovat</>
                ) : (
                  <><Sparkles className={`h-3 w-3 mr-1 ${generating ? "animate-pulse" : ""}`} /> ✨ Vygenerovat popis</>
                )}
              </Button>

              {/* E) Canon Control */}
              {latestNarrative && !latestNarrative.is_canon && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => handleConfirmCanon(latestNarrative.id)}
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" /> ✅ Potvrdit jako oficiální zápis
                </Button>
              )}
            </div>
          )}
          {!isEventOwner && !latestNarrative && (
            <p className="text-xs text-muted-foreground italic">Narativ může vygenerovat pouze autor události.</p>
          )}

          {narratives.length > 1 && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground">
                Předchozí verze ({narratives.length - 1})
              </summary>
              <div className="mt-2 space-y-2">
                {narratives.slice(1).map(n => (
                  <div key={n.id} className="p-2 rounded border bg-muted/20 text-sm">
                    <p className="whitespace-pre-wrap">{n.narrative_text}</p>
                    <p className="text-xs mt-1">v{n.version} • {n.epoch_style}</p>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EventDetailModal;
