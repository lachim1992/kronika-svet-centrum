import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { closeTurnForPlayer } from "@/hooks/useGameSession";
import { isElevatedRole } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Lock, CheckCircle2, Clock, Loader2, Send, MessageSquare,
  Users, Scroll, Swords, Megaphone, Globe2, MessageCircle
} from "lucide-react";
import { toast } from "sonner";
import FeedComments from "@/components/feed/FeedComments";

interface Props {
  sessionId: string;
  currentTurn: number;
  players: any[];
  currentPlayerName: string;
  myRole: string;
  gameMode?: string;
  onRefetch: () => void;
}

interface ChatMessage {
  id: string;
  session_id: string;
  player_name: string;
  message: string;
  channel: string;
  turn_number: number;
  created_at: string;
}

interface TurnEvent {
  id: string;
  type: "event" | "world_event" | "declaration" | "rumor";
  title: string;
  description: string;
  turn_number: number;
  created_at: string;
  player_name?: string;
}

const PLAYER_COLORS = [
  "text-amber-400", "text-cyan-400", "text-emerald-400",
  "text-rose-400", "text-violet-400", "text-orange-400",
];

const TurnProgressionPanel = ({
  sessionId, currentTurn, players, currentPlayerName, myRole, gameMode, onRefetch,
}: Props) => {
  const isAdmin = isElevatedRole(myRole) || !myRole;
  const currentPlayer = players.find(p => p.player_name === currentPlayerName);
  const myTurnClosed = currentPlayer?.turn_closed || false;
  const allClosed = players.length > 0 && players.every(p => p.turn_closed);
  const isAIMode = gameMode === "tb_single_ai";
  const isMultiplayer = gameMode === "tb_multi";

  const [turnSummaries, setTurnSummaries] = useState<any[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [turnEvents, setTurnEvents] = useState<TurnEvent[]>([]);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const playerColorMap: Record<string, string> = {};
  const allPlayerNames = [...new Set([...players.map(p => p.player_name), ...chatMessages.map(m => m.player_name)])];
  allPlayerNames.forEach((name, i) => {
    playerColorMap[name] = PLAYER_COLORS[i % PLAYER_COLORS.length];
  });

  // Fetch turn summaries
  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("turn_summaries")
        .select("*")
        .eq("session_id", sessionId)
        .order("turn_number", { ascending: false })
        .limit(10);
      if (data) setTurnSummaries(data);
    };
    fetch();
  }, [sessionId, currentTurn]);

  // Fetch chat messages
  const fetchChat = useCallback(async () => {
    const { data } = await supabase
      .from("game_chat")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (data) setChatMessages(data as ChatMessage[]);
  }, [sessionId]);

  useEffect(() => { fetchChat(); }, [fetchChat]);

  // Realtime chat subscription
  useEffect(() => {
    const channel = supabase
      .channel(`turn-chat-${sessionId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "game_chat",
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        setChatMessages(prev => [...prev, payload.new as ChatMessage]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Fetch events for last turn
  useEffect(() => {
    if (currentTurn < 2) { setTurnEvents([]); return; }
    const lastTurn = currentTurn - 1;

    const fetchEvents = async () => {
      const [evtRes, weRes, declRes, rumorRes] = await Promise.all([
        supabase.from("game_events").select("id, event_type, note, turn_number, created_at, player, location")
          .eq("session_id", sessionId).eq("turn_number", lastTurn).eq("confirmed", true).order("created_at", { ascending: false }).limit(20),
        supabase.from("world_events").select("id, title, description, created_turn, created_at")
          .eq("session_id", sessionId).eq("created_turn", lastTurn).order("created_at", { ascending: false }).limit(10),
        supabase.from("declarations").select("id, title, original_text, turn_number, created_at, player_name")
          .eq("session_id", sessionId).eq("turn_number", lastTurn).order("created_at", { ascending: false }).limit(10),
        supabase.from("city_rumors").select("id, text, turn_number, created_at, city_name, created_by")
          .eq("session_id", sessionId).eq("turn_number", lastTurn).eq("is_draft", false).order("created_at", { ascending: false }).limit(10),
      ]);

      const combined: TurnEvent[] = [
        ...(evtRes.data || []).map((e: any) => ({
          id: e.id, type: "event" as const, title: e.event_type || "Událost",
          description: e.note || e.location || "", turn_number: e.turn_number, created_at: e.created_at, player_name: e.player,
        })),
        ...(weRes.data || []).map((e: any) => ({
          id: e.id, type: "world_event" as const, title: e.title || "Světová událost",
          description: e.description || "", turn_number: e.created_turn, created_at: e.created_at,
        })),
        ...(declRes.data || []).map((e: any) => ({
          id: e.id, type: "declaration" as const, title: e.title || "Vyhlášení",
          description: e.original_text || "", turn_number: e.turn_number, created_at: e.created_at, player_name: e.player_name,
        })),
        ...(rumorRes.data || []).map((e: any) => ({
          id: e.id, type: "rumor" as const, title: `Zvěst z ${e.city_name}`,
          description: e.text || "", turn_number: e.turn_number, created_at: e.created_at, player_name: e.created_by,
        })),
      ];

      combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setTurnEvents(combined);
    };
    fetchEvents();
  }, [sessionId, currentTurn]);

  const sendChatMessage = async () => {
    const text = chatInput.trim();
    if (!text || chatSending) return;
    setChatSending(true);
    setChatInput("");
    await supabase.from("game_chat").insert({
      session_id: sessionId,
      player_name: currentPlayerName,
      message: text,
      channel: "public",
      turn_number: currentTurn,
    } as any);
    setChatSending(false);
  };

  const handleCloseTurn = async () => {
    if (!currentPlayer) return;
    await closeTurnForPlayer(sessionId, currentPlayer.player_number);
    await supabase.from("world_action_log").insert({
      session_id: sessionId,
      player_name: currentPlayerName,
      turn_number: currentTurn,
      action_type: "other",
      description: `${currentPlayerName} uzavřel kolo ${currentTurn}`,
    });
    toast.success("Kolo uzavřeno.");
    onRefetch();
  };

  // AI mode turn handled by AppHeader's unified button

  const typeIcon = (type: string) => {
    switch (type) {
      case "event": return <Swords className="h-3.5 w-3.5 text-primary shrink-0" />;
      case "world_event": return <Globe2 className="h-3.5 w-3.5 text-accent shrink-0" />;
      case "declaration": return <Megaphone className="h-3.5 w-3.5 text-primary shrink-0" />;
      case "rumor": return <MessageCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
      default: return null;
    }
  };

  const turnStatus = allClosed ? "waiting" : "active";

  // Group chat messages by turn
  const groupedChat: { turn: number; msgs: ChatMessage[] }[] = [];
  let currentGroup: { turn: number; msgs: ChatMessage[] } | null = null;
  for (const msg of chatMessages) {
    if (!currentGroup || currentGroup.turn !== msg.turn_number) {
      currentGroup = { turn: msg.turn_number, msgs: [] };
      groupedChat.push(currentGroup);
    }
    currentGroup.msgs.push(msg);
  }

  return (
    <div className="space-y-4">
      {/* Turn header + status */}
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-sm flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          Kolo {currentTurn}
        </h3>
        <Badge variant={turnStatus === "active" ? "default" : "secondary"} className="text-xs">
          {turnStatus === "active" ? "🟢 Aktivní" : "⏳ Čeká na zpracování"}
        </Badge>
      </div>

      {/* Player readiness */}
      <div className="space-y-1">
        {players.map(p => (
          <div key={p.id} className="flex items-center gap-2 text-sm p-2 rounded border border-border bg-card">
            {p.turn_closed ? (
              <CheckCircle2 className="h-4 w-4 text-primary" />
            ) : (
              <Lock className="h-4 w-4 text-muted-foreground" />
            )}
            <span className={`font-display ${p.turn_closed ? "text-primary font-medium" : "text-muted-foreground"}`}>
              {p.player_name}
            </span>
            <Badge variant={p.turn_closed ? "default" : "outline"} className="text-xs ml-auto">
              {p.turn_closed ? "Hotovo" : "Čeká"}
            </Badge>
          </div>
        ))}
      </div>

      {/* Turn actions removed — unified in AppHeader */}

      {/* Close turn + status indicators removed — unified in AppHeader */}


      {/* Sub-tabs: Chat + Events + History */}
      <Tabs defaultValue="events" className="w-full mt-2">
        <TabsList className="w-full justify-start bg-card border border-border h-auto p-1 gap-1">
          <TabsTrigger value="events" className="font-display text-xs gap-1">
            <Swords className="h-3 w-3" />Události ({turnEvents.length})
          </TabsTrigger>
          <TabsTrigger value="chat" className="font-display text-xs gap-1">
            <MessageSquare className="h-3 w-3" />Chat
          </TabsTrigger>
          <TabsTrigger value="history" className="font-display text-xs gap-1">
            <Scroll className="h-3 w-3" />Historie
          </TabsTrigger>
        </TabsList>

        {/* Events feed with comments */}
        <TabsContent value="events" className="mt-2 space-y-2">
          {turnEvents.length === 0 ? (
            <p className="text-xs text-muted-foreground italic text-center py-4">
              Žádné události z předchozího kola.
            </p>
          ) : (
            turnEvents.map(evt => (
              <div key={`${evt.type}-${evt.id}`} className="p-3 rounded-lg border border-border bg-card space-y-1.5">
                <div className="flex items-start gap-2">
                  {typeIcon(evt.type)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-display font-semibold truncate">{evt.title}</span>
                      {evt.player_name && (
                        <span className={`text-[10px] font-display font-bold ${playerColorMap[evt.player_name] || "text-foreground"}`}>
                          {evt.player_name}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{evt.description}</p>
                  </div>
                </div>
                <FeedComments
                  sessionId={sessionId}
                  targetType={evt.type === "rumor" ? "rumor" : "event"}
                  targetId={evt.id}
                  playerName={currentPlayerName}
                  currentTurn={currentTurn}
                  playerColors={playerColorMap}
                />
              </div>
            ))
          )}
        </TabsContent>

        {/* Inline chat */}
        <TabsContent value="chat" className="mt-2">
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div ref={chatScrollRef} className="max-h-[300px] overflow-y-auto px-3 py-2 space-y-0.5">
              {chatMessages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Users className="h-8 w-8 opacity-30 mb-2" />
                  <p className="text-xs italic">Žádné zprávy. Zahajte konverzaci!</p>
                </div>
              )}
              {groupedChat.map(group => (
                <div key={group.turn}>
                  <div className="flex items-center gap-2 my-2">
                    <div className="flex-1 h-px bg-border/30" />
                    <span className="text-[9px] text-muted-foreground/60 font-display">Rok {group.turn}</span>
                    <div className="flex-1 h-px bg-border/30" />
                  </div>
                  {group.msgs.map(msg => {
                    const isMe = msg.player_name === currentPlayerName;
                    return (
                      <div key={msg.id} className={`py-1 ${isMe ? "text-right" : ""}`}>
                        <div className={`inline-block max-w-[85%] rounded-lg px-2.5 py-1.5 text-left ${
                          isMe ? "bg-primary/15 border border-primary/20" : "bg-muted/40 border border-border/30"
                        }`}>
                          {!isMe && (
                            <p className={`text-[10px] font-display font-bold ${playerColorMap[msg.player_name] || "text-foreground"}`}>
                              {msg.player_name}
                            </p>
                          )}
                          <p className="text-xs leading-relaxed">{msg.message}</p>
                          <p className="text-[9px] text-muted-foreground/50 mt-0.5">
                            {new Date(msg.created_at).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Chat input */}
            <div className="border-t border-border p-2 flex items-center gap-2">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendChatMessage()}
                placeholder="Napište zprávu..."
                className="flex-1 bg-muted/30 border border-border/50 rounded-lg px-3 py-1.5 text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 transition-colors"
                maxLength={500}
              />
              <button
                onClick={sendChatMessage}
                disabled={!chatInput.trim() || chatSending}
                className="h-8 w-8 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 flex items-center justify-center transition-colors disabled:opacity-30"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </TabsContent>

        {/* Turn history */}
        <TabsContent value="history" className="mt-2 space-y-1">
          {turnSummaries.length === 0 ? (
            <p className="text-xs text-muted-foreground italic text-center py-4">
              Žádná historie kol.
            </p>
          ) : (
            turnSummaries.map(ts => (
              <div key={ts.id} className="text-xs p-2 rounded border border-border bg-card">
                <span className="font-medium font-display">Rok {ts.turn_number}</span>
                <span className="text-muted-foreground ml-2">
                  Uzavřel: {ts.closed_by} • {new Date(ts.closed_at || ts.created_at).toLocaleString("cs-CZ")}
                </span>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TurnProgressionPanel;
