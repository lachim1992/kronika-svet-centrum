import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MessageCircle, Send, X, Users, Scroll } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ChatMessage {
  id: string;
  session_id: string;
  player_name: string;
  message: string;
  channel: string;
  turn_number: number;
  created_at: string;
}

interface Props {
  sessionId: string;
  playerName: string;
  currentTurn: number;
  players?: string[];
}

const GameChatFAB = ({ sessionId, playerName, currentTurn, players = [] }: Props) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastSeenRef = useRef<string | null>(null);

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    const { data } = await supabase
      .from("game_chat")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (data) {
      setMessages(data as ChatMessage[]);
      if (open && data.length > 0) {
        lastSeenRef.current = data[data.length - 1].id;
        setUnread(0);
      }
    }
  }, [sessionId, open]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`game-chat-${sessionId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "game_chat",
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        const msg = payload.new as ChatMessage;
        setMessages(prev => [...prev, msg]);
        if (!open && msg.player_name !== playerName) {
          setUnread(prev => prev + 1);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId, playerName, open]);

  // Auto-scroll
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  // Mark as read when opening
  useEffect(() => {
    if (open) {
      setUnread(0);
      if (messages.length > 0) {
        lastSeenRef.current = messages[messages.length - 1].id;
      }
    }
  }, [open, messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput("");
    await supabase.from("game_chat").insert({
      session_id: sessionId,
      player_name: playerName,
      message: text,
      channel: "public",
      turn_number: currentTurn,
    } as any);
    setSending(false);
  };

  // Group messages by turn
  const groupedByTurn: { turn: number; msgs: ChatMessage[] }[] = [];
  let currentGroup: { turn: number; msgs: ChatMessage[] } | null = null;
  for (const msg of messages) {
    if (!currentGroup || currentGroup.turn !== msg.turn_number) {
      currentGroup = { turn: msg.turn_number, msgs: [] };
      groupedByTurn.push(currentGroup);
    }
    currentGroup.msgs.push(msg);
  }

  // Player color map
  const playerColors = ["text-amber-400", "text-cyan-400", "text-emerald-400", "text-rose-400", "text-violet-400", "text-orange-400"];
  const getPlayerColor = (name: string) => {
    const allPlayers = [...new Set([...players, ...messages.map(m => m.player_name)])];
    const idx = allPlayers.indexOf(name);
    return playerColors[idx >= 0 ? idx % playerColors.length : 0];
  };

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(!open)}
        className={`fixed bottom-[13rem] right-4 z-50 h-12 w-12 rounded-full border flex items-center justify-center transition-all duration-300 ${
          open
            ? "border-primary/60 shadow-[0_0_16px_hsl(var(--primary)/0.35)] text-primary"
            : "border-primary/25 hover:border-primary/45 shadow-[0_4px_12px_hsl(228_40%_3%/0.4)] text-primary/60 hover:text-primary"
        }`}
        style={{
          background: open
            ? "linear-gradient(135deg, hsl(43 74% 42% / 0.25), hsl(224 34% 14% / 0.95), hsl(43 74% 42% / 0.15))"
            : "linear-gradient(135deg, hsl(43 74% 30% / 0.12), hsl(224 34% 12% / 0.95), hsl(43 74% 30% / 0.08))",
        }}
        aria-label="Herní chat"
      >
        <MessageCircle className="h-5 w-5" strokeWidth={open ? 2.2 : 1.5} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
            {unread}
          </span>
        )}
      </button>

      {/* Chat Panel */}
      {open && (
        <div className="fixed bottom-[16.5rem] right-4 z-50 w-80 max-h-[50vh] rounded-xl border border-primary/30 shadow-2xl flex flex-col overflow-hidden"
          style={{
            background: "linear-gradient(180deg, hsl(224 34% 12% / 0.98), hsl(224 34% 8% / 0.98))",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span className="font-display font-bold text-sm">Herní chat</span>
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                Rok {currentTurn}
              </Badge>
            </div>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5 min-h-[150px] max-h-[35vh]">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Scroll className="h-8 w-8 opacity-30 mb-2" />
                <p className="text-xs italic">Žádné zprávy. Zahajte konverzaci!</p>
              </div>
            )}
            {groupedByTurn.map((group) => (
              <div key={group.turn}>
                <div className="flex items-center gap-2 my-2">
                  <div className="flex-1 h-px bg-border/30" />
                  <span className="text-[9px] text-muted-foreground/60 font-display">Rok {group.turn}</span>
                  <div className="flex-1 h-px bg-border/30" />
                </div>
                {group.msgs.map((msg) => {
                  const isMe = msg.player_name === playerName;
                  return (
                    <div key={msg.id} className={`py-1 ${isMe ? "text-right" : ""}`}>
                      <div className={`inline-block max-w-[85%] rounded-lg px-2.5 py-1.5 text-left ${
                        isMe ? "bg-primary/15 border border-primary/20" : "bg-muted/40 border border-border/30"
                      }`}>
                        {!isMe && (
                          <p className={`text-[10px] font-display font-bold ${getPlayerColor(msg.player_name)}`}>
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

          {/* Input */}
          <div className="border-t border-border/50 p-2 flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
              placeholder="Napište zprávu..."
              className="flex-1 bg-muted/30 border border-border/50 rounded-lg px-3 py-1.5 text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 transition-colors"
              maxLength={500}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              className="h-8 w-8 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 flex items-center justify-center transition-colors disabled:opacity-30"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default GameChatFAB;
