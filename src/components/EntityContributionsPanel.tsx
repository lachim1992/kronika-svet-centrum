import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, ThumbsUp, ThumbsDown, Loader2, Sparkles, Check, X, MessageSquare,
  Crown, ScrollText, ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import RichText from "@/components/RichText";

interface Props {
  sessionId: string;
  entityType: string;
  entityId: string;
  currentPlayerName: string;
  players: any[];
  myRole: string;
  onEventClick?: (eventId: string) => void;
}

interface Contribution {
  id: string;
  author_player: string;
  content_type: string;
  title: string | null;
  content_text: string;
  ai_expanded_text: string | null;
  image_url: string | null;
  status: string;
  votes_yes: string[];
  votes_no: string[];
  vote_threshold: number;
  accepted_at: string | null;
  created_at: string;
}

const CONTENT_TYPES = [
  { value: "lore", label: "Příběh / legenda" },
  { value: "building", label: "Stavba / budova" },
  { value: "monument", label: "Monument / pomník" },
  { value: "legend", label: "Místní legenda" },
  { value: "battle_account", label: "Válečný záznam" },
  { value: "cultural_note", label: "Kulturní poznámka" },
  { value: "rumor", label: "Zvěst / drby" },
];

const STATUS_LABELS: Record<string, string> = {
  draft: "Koncept",
  proposed: "Navrženo",
  accepted: "Kánon ✓",
  rejected: "Zamítnuto",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "secondary",
  proposed: "outline",
  accepted: "default",
  rejected: "destructive",
};

const EntityContributionsPanel = ({
  sessionId, entityType, entityId, currentPlayerName, players, myRole, onEventClick,
}: Props) => {
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [expanding, setExpanding] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form
  const [contentType, setContentType] = useState("lore");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");

  const isAdmin = myRole === "admin" || myRole === "moderator";
  const totalPlayers = players.length || 2;

  useEffect(() => { fetchContributions(); }, [sessionId, entityId]);

  const fetchContributions = async () => {
    const { data } = await supabase
      .from("entity_contributions")
      .select("*")
      .eq("session_id", sessionId)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false });
    if (data) setContributions(data as Contribution[]);
  };

  const handleSubmit = async () => {
    if (!text.trim()) { toast.error("Napište text příspěvku"); return; }
    setSubmitting(true);
    try {
      const threshold = Math.max(2, Math.ceil(totalPlayers / 2));
      await supabase.from("entity_contributions").insert({
        session_id: sessionId,
        entity_type: entityType,
        entity_id: entityId,
        author_player: currentPlayerName,
        content_type: contentType,
        title: title.trim() || null,
        content_text: text.trim(),
        status: "proposed",
        vote_threshold: threshold,
        votes_yes: [currentPlayerName],
      });
      setTitle(""); setText(""); setShowForm(false);
      toast.success("Příspěvek navržen ke schválení!");
      fetchContributions();
    } catch {
      toast.error("Nepodařilo se odeslat příspěvek");
    }
    setSubmitting(false);
  };

  const handleVote = async (contribId: string, isYes: boolean) => {
    const c = contributions.find(x => x.id === contribId);
    if (!c) return;

    const yesVotes = new Set(c.votes_yes || []);
    const noVotes = new Set(c.votes_no || []);
    yesVotes.delete(currentPlayerName);
    noVotes.delete(currentPlayerName);
    if (isYes) yesVotes.add(currentPlayerName);
    else noVotes.add(currentPlayerName);

    const newYes = Array.from(yesVotes);
    const newNo = Array.from(noVotes);
    const accepted = newYes.length >= c.vote_threshold;

    await supabase.from("entity_contributions").update({
      votes_yes: newYes,
      votes_no: newNo,
      ...(accepted ? { status: "accepted", accepted_at: new Date().toISOString() } : {}),
    }).eq("id", contribId);

    if (accepted) toast.success("🏛️ Příspěvek se stal součástí kánonu!");
    fetchContributions();
  };

  const handleExpand = async (contribId: string) => {
    setExpanding(contribId);
    try {
      const c = contributions.find(x => x.id === contribId);
      if (!c) return;
      const { data, error } = await supabase.functions.invoke("expand-contribution", {
        body: {
          entityType, entityName: "",
          shortText: c.content_text,
          contentType: c.content_type,
          sessionId,
        },
      });
      if (error) throw error;
      if (data?.expandedText) {
        await supabase.from("entity_contributions").update({
          ai_expanded_text: data.expandedText,
          image_url: data.imageUrl || null,
        }).eq("id", contribId);
        toast.success("Text rozšířen pomocí AI!");
        fetchContributions();
      }
    } catch {
      toast.error("AI rozšíření selhalo");
    }
    setExpanding(null);
  };

  const handleAdminAction = async (contribId: string, action: "accepted" | "rejected") => {
    await supabase.from("entity_contributions").update({
      status: action,
      ...(action === "accepted" ? { accepted_at: new Date().toISOString() } : {}),
    }).eq("id", contribId);
    toast.success(action === "accepted" ? "Příspěvek přijat do kánonu" : "Příspěvek zamítnut");
    fetchContributions();
  };

  const accepted = contributions.filter(c => c.status === "accepted");
  const proposed = contributions.filter(c => c.status === "proposed");
  const others = contributions.filter(c => c.status !== "accepted" && c.status !== "proposed");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-sm flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-primary" />
          Příspěvky hráčů ({contributions.length})
        </h3>
        <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-3 w-3 mr-1" />{showForm ? "Zavřít" : "Přidat příspěvek"}
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-card p-4 rounded-lg border-2 border-primary/20 space-y-3">
          <Select value={contentType} onValueChange={setContentType}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CONTENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Název (volitelné)" value={title} onChange={e => setTitle(e.target.value)} className="h-8 text-sm" />
          <Textarea placeholder="Popište svůj příspěvek... (AI ho může rozšířit)" value={text} onChange={e => setText(e.target.value)} rows={3} />
          <p className="text-xs text-muted-foreground">
            Příspěvek bude navržen ke schválení. Po dosažení {Math.max(2, Math.ceil(totalPlayers / 2))} hlasů se stane kánonem.
          </p>
          <Button size="sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <MessageSquare className="h-3 w-3 mr-1" />}
            Navrhnout
          </Button>
        </div>
      )}

      {/* Accepted canon */}
      {accepted.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-primary flex items-center gap-1"><Crown className="h-3 w-3" /> Kanonické příspěvky</p>
          {accepted.map(c => (
            <div key={c.id} className="p-3 rounded-lg border border-primary/30 bg-primary/5 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                {c.title && <span className="font-display font-semibold text-sm">{c.title}</span>}
                <Badge className="text-xs">{CONTENT_TYPES.find(t => t.value === c.content_type)?.label}</Badge>
                <Badge variant="default" className="text-xs">Kánon ✓</Badge>
                <span className="text-xs text-muted-foreground ml-auto">{c.author_player}</span>
              </div>
              <RichText
                text={c.ai_expanded_text || c.content_text}
                onEventClick={onEventClick}
                className="text-sm leading-relaxed"
              />
              {c.image_url && (
                <img src={c.image_url} alt="" className="w-full max-h-48 object-cover rounded border border-border" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Proposed - voting */}
      {proposed.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">Čeká na schválení ({proposed.length})</p>
          {proposed.map(c => {
            const myVote = (c.votes_yes || []).includes(currentPlayerName) ? "yes" : (c.votes_no || []).includes(currentPlayerName) ? "no" : null;
            const progress = ((c.votes_yes || []).length / c.vote_threshold) * 100;
            return (
              <div key={c.id} className="p-3 rounded-lg border border-border space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {c.title && <span className="font-display font-semibold text-sm">{c.title}</span>}
                  <Badge variant="outline" className="text-xs">{CONTENT_TYPES.find(t => t.value === c.content_type)?.label}</Badge>
                  <span className="text-xs text-muted-foreground ml-auto">{c.author_player}</span>
                </div>
                <p className="text-sm">{c.ai_expanded_text || c.content_text}</p>
                {c.image_url && (
                  <img src={c.image_url} alt="" className="w-full max-h-32 object-cover rounded border border-border" />
                )}
                {/* Vote bar */}
                <div className="space-y-1">
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(100, progress)}%` }} />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>👍 {(c.votes_yes || []).length} / {c.vote_threshold}</span>
                    <span>👎 {(c.votes_no || []).length}</span>
                  </div>
                </div>
                {/* Actions */}
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant={myVote === "yes" ? "default" : "outline"} onClick={() => handleVote(c.id, true)}>
                    <ThumbsUp className="h-3 w-3 mr-1" />Souhlasím
                  </Button>
                  <Button size="sm" variant={myVote === "no" ? "destructive" : "outline"} onClick={() => handleVote(c.id, false)}>
                    <ThumbsDown className="h-3 w-3 mr-1" />Nesouhlasím
                  </Button>
                  {c.author_player === currentPlayerName && !c.ai_expanded_text && (
                    <Button size="sm" variant="outline" onClick={() => handleExpand(c.id)} disabled={expanding === c.id}>
                      {expanding === c.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                      AI rozšíření
                    </Button>
                  )}
                  {isAdmin && (
                    <>
                      <Button size="sm" variant="outline" className="ml-auto" onClick={() => handleAdminAction(c.id, "accepted")}>
                        <Check className="h-3 w-3 mr-1" />Přijmout
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleAdminAction(c.id, "rejected")}>
                        <X className="h-3 w-3 mr-1" />Zamítnout
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {contributions.length === 0 && !showForm && (
        <p className="text-xs text-muted-foreground italic text-center py-4">
          Žádné příspěvky. Buďte první, kdo přidá příběh, stavbu nebo legendu!
        </p>
      )}
    </div>
  );
};

export default EntityContributionsPanel;
