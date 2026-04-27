import { useState, useEffect, useRef } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Scroll, Send, Plus, Users, Building2, Sparkles, Lock, Eye, AlertTriangle, Bot } from "lucide-react";
import { toast } from "sonner";

type GamePlayer = Tables<"game_players">;
type CityState = Tables<"city_states">;
type AIFaction = Tables<"ai_factions">;

interface DiplomacyRoom {
  id: string;
  session_id: string;
  room_type: string;
  participant_a: string;
  participant_b: string;
  npc_city_state_id: string | null;
  created_at: string;
}

interface DiplomacyMessage {
  id: string;
  room_id: string;
  sender: string;
  sender_type: string;
  message_text: string;
  secrecy: string;
  message_tag: string | null;
  leak_chance: number;
  created_at: string;
}

interface DiplomacyPanelProps {
  sessionId: string;
  players: GamePlayer[];
  cityStates: CityState[];
  currentPlayerName: string;
  gameMode?: string;
}

const TAG_LABELS: Record<string, string> = {
  trade_offer: "🤝 Obchodní nabídka",
  tribute_demand: "💰 Požadavek tributu",
  alliance_proposal: "⚔️ Návrh spojenectví",
  threat: "☠️ Hrozba",
  peace_treaty: "🕊️ Mírová smlouva",
  espionage: "🕵️ Špionáž",
};

const SECRECY_ICONS: Record<string, React.ReactNode> = {
  PUBLIC: <Eye className="h-3 w-3" />,
  PRIVATE: <Lock className="h-3 w-3" />,
  LEAKABLE: <AlertTriangle className="h-3 w-3" />,
};

const DiplomacyPanel = ({ sessionId, players, cityStates, currentPlayerName, gameMode }: DiplomacyPanelProps) => {
  const [rooms, setRooms] = useState<DiplomacyRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<DiplomacyRoom | null>(null);
  const [messages, setMessages] = useState<DiplomacyMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [secrecy, setSecrecy] = useState("PRIVATE");
  const [messageTag, setMessageTag] = useState<string>("__none__");
  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState("player_player");
  const [createTarget, setCreateTarget] = useState("");
  const [loadingNpc, setLoadingNpc] = useState(false);
  const [aiFactions, setAiFactions] = useState<AIFaction[]>([]);
  const [aiPlayerNames, setAiPlayerNames] = useState<string[]>([]);
  const [activeWars, setActiveWars] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isAIMode = gameMode === "tb_single_ai";
  // Anyone in the session who is not me AND not a real human is a candidate AI partner.
  const humanPlayerNameSet = new Set(
    (players || [])
      .filter((p: any) => p.user_id) // human seats have user_id
      .map(p => p.player_name),
  );
  const otherPlayers = players
    .filter(p => p.player_name !== currentPlayerName && p.user_id)
    .map(p => p.player_name);

  // Fetch rooms + AI factions + active wars
  useEffect(() => {
    fetchRooms();
    fetchAIFactions();
    fetchActiveWars();
  }, [sessionId]);

  const fetchAIFactions = async () => {
    const { data } = await supabase.from("ai_factions")
      .select("*")
      .eq("session_id", sessionId)
      .eq("is_active", true);
    if (data) setAiFactions(data);

    // Fallback: derive AI player names from civilizations.is_ai or
    // game_players seats without user_id. Keeps the AI diplomacy UI alive
    // even when ai_factions row is missing.
    const [aiCivsRes, gpRes] = await Promise.all([
      supabase.from("civilizations").select("player_name, is_ai").eq("session_id", sessionId).eq("is_ai", true),
      supabase.from("game_players").select("player_name, user_id").eq("session_id", sessionId),
    ]);
    const names = new Set<string>();
    for (const f of (data || [])) names.add(f.faction_name);
    for (const c of (aiCivsRes.data || [])) if (c.player_name) names.add(c.player_name);
    for (const g of (gpRes.data || [])) {
      if (!g.user_id && g.player_name && g.player_name !== currentPlayerName && !humanPlayerNameSet.has(g.player_name)) {
        names.add(g.player_name);
      }
    }
    names.delete(currentPlayerName);
    setAiPlayerNames(Array.from(names));
  };

  const fetchActiveWars = async () => {
    const { data } = await supabase.from("war_declarations")
      .select("*")
      .eq("session_id", sessionId)
      .in("status", ["active", "peace_offered"]);
    setActiveWars(data || []);
  };



  const fetchRooms = async () => {
    const { data } = await supabase
      .from("diplomacy_rooms")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false });
    if (data) setRooms(data as DiplomacyRoom[]);
  };

  // Fetch messages when room selected
  useEffect(() => {
    if (!selectedRoom) return;
    fetchMessages();

    const channel = supabase
      .channel(`diplomacy-${selectedRoom.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "diplomacy_messages",
        filter: `room_id=eq.${selectedRoom.id}`,
      }, () => fetchMessages())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedRoom?.id]);

  const fetchMessages = async () => {
    if (!selectedRoom) return;
    const { data } = await supabase
      .from("diplomacy_messages")
      .select("*")
      .eq("room_id", selectedRoom.id)
      .order("created_at", { ascending: true });
    if (data) {
      setMessages(data as DiplomacyMessage[]);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  };

  const handleCreateRoom = async () => {
    if (!createTarget) { toast.error("Vyberte účastníka"); return; }

    const participant_a = currentPlayerName;
    const participant_b = createTarget;
    const isNpcTarget = createType === "player_npc";
    const isAiFactionTarget = createType === "player_ai_faction";
    const npc_city_state_id = isNpcTarget
      ? cityStates.find(cs => cs.name === createTarget)?.id || null
      : null;

    const { error } = await supabase.from("diplomacy_rooms").insert({
      session_id: sessionId,
      room_type: isAiFactionTarget ? "player_ai_faction" : createType,
      participant_a,
      participant_b,
      npc_city_state_id,
    });

    if (error) { toast.error("Nepodařilo se vytvořit místnost"); return; }
    toast.success("Diplomatická komnata otevřena");
    setShowCreate(false);
    setCreateTarget("");
    fetchRooms();
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedRoom) return;

    const leakChance = secrecy === "LEAKABLE" ? Math.floor(Math.random() * 16) + 5 : 0;

    const { error } = await supabase.from("diplomacy_messages").insert({
      room_id: selectedRoom.id,
      sender: currentPlayerName,
      sender_type: "player",
      message_text: newMessage.trim(),
      secrecy,
      message_tag: messageTag === "__none__" ? null : messageTag,
      leak_chance: leakChance,
    });

    if (error) { toast.error("Nepodařilo se odeslat zprávu"); return; }
    setNewMessage("");
    setMessageTag("__none__");

    // AI reply is now triggered manually via the prominent button below chat
  };

  const handleNpcReply = async () => {
    if (!selectedRoom) return;
    setLoadingNpc(true);

    try {
      const isNpcRoom = selectedRoom.room_type === "player_npc";
      const factionName = selectedRoom.participant_a === currentPlayerName
        ? selectedRoom.participant_b : selectedRoom.participant_a;
      const isAiFactionRoom = selectedRoom.room_type === "player_ai_faction"
        || aiFactions.some(f => f.faction_name === factionName);

      if (isAiFactionRoom) {
        // AI faction diplomacy reply
        const faction = aiFactions.find(f => f.faction_name === factionName);

        const { data, error } = await supabase.functions.invoke("diplomacy-reply", {
          body: {
            sessionId,
            aiFaction: { faction_name: factionName },
            recentMessages: messages.slice(-10),
            recentConfirmedEvents: [],
            worldFacts: [],
          },
        });

        if (error) throw error;

        // The edge function now posts action messages itself (ultimatums, war, etc.)
        // We only insert the reply text if there is one
        if (data.replyText) {
          await supabase.from("diplomacy_messages").insert({
            room_id: selectedRoom.id,
            sender: factionName,
            sender_type: "npc",
            message_text: data.replyText,
            secrecy: "PRIVATE",
            message_tag: null,
            leak_chance: 0,
          });
        }

        // Show action notifications
        const actions = data.actionsTaken || [];
        if (actions.includes("declare_war")) {
          toast.error(`⚔️ ${factionName} vyhlásil VÁLKU!`);
        } else if (actions.includes("send_ultimatum")) {
          toast.warning(`⚠️ ${factionName} poslal ultimátum!`);
        } else if (actions.includes("offer_peace")) {
          toast.info(`🕊️ ${factionName} nabízí mír`);
        } else if (actions.includes("offer_trade")) {
          toast.success(`💰 ${factionName} nabízí obchod`);
        } else if (actions.includes("offer_alliance")) {
          toast.success(`🤝 ${factionName} navrhuje spojenectví`);
        } else if (actions.includes("trade_embargo")) {
          toast.error(`🚫 ${factionName} uvalil embargo!`);
        } else if (actions.includes("threaten")) {
          toast.warning(`⚠️ ${factionName} vám vyhrožuje`);
        } else {
          toast.success(`${factionName} odpověděl(a)`);
        }

        // Refresh wars if a war-related action happened
        if (actions.some((a: string) => ["declare_war", "offer_peace", "accept_peace", "reject_peace"].includes(a))) {
          fetchActiveWars();
        }
      } else if (isNpcRoom && selectedRoom.npc_city_state_id) {
        const npc = cityStates.find(cs => cs.id === selectedRoom.npc_city_state_id);
        if (!npc) throw new Error("NPC nenalezeno");

        const { data, error } = await supabase.functions.invoke("diplomacy-reply", {
          body: {
            npc: { name: npc.name, type: npc.type, mood: npc.mood },
            recentMessages: messages.slice(-10),
            recentConfirmedEvents: [],
            worldFacts: [],
          },
        });

        if (error) throw error;

        await supabase.from("diplomacy_messages").insert({
          room_id: selectedRoom.id,
          sender: npc.name,
          sender_type: "npc",
          message_text: data.replyText || "... diplomat mlčí ...",
          secrecy: "PRIVATE",
          message_tag: null,
          leak_chance: 0,
        });

        toast.success(`${npc.name} odpověděl(a)`);
      }
    } catch {
      toast.error("AI diplomat selhal");
    }
    setLoadingNpc(false);
  };

  const myRooms = rooms.filter(r =>
    r.participant_a === currentPlayerName || r.participant_b === currentPlayerName
  );

  // Room list view
  if (!selectedRoom) {
    return (
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-decorative font-bold flex items-center gap-2">
            <Scroll className="h-6 w-6 text-illuminated" />
            Diplomatické komnaty
          </h1>
          <Button onClick={() => setShowCreate(!showCreate)} size="sm" className="font-display">
            <Plus className="h-3 w-3 mr-1" />{showCreate ? "Zavřít" : "Nová komnata"}
          </Button>
        </div>

        {showCreate && (
          <div className="manuscript-card p-4 space-y-3">
            <h3 className="font-display font-semibold text-sm">Otevřít diplomatický kanál</h3>
            <div className="flex gap-2">
              <Select value={createType} onValueChange={v => { setCreateType(v); setCreateTarget(""); }}>
                <SelectTrigger className="w-40 h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="player_player"><Users className="h-3 w-3 inline mr-1" />Hráč ↔ Hráč</SelectItem>
                  <SelectItem value="player_npc"><Building2 className="h-3 w-3 inline mr-1" />Hráč ↔ NPC</SelectItem>
                  {isAIMode && aiPlayerNames.length > 0 && (
                    <SelectItem value="player_ai_faction"><Bot className="h-3 w-3 inline mr-1" />Hráč ↔ AI Frakce</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <Select value={createTarget} onValueChange={setCreateTarget}>
                <SelectTrigger className="flex-1 h-9 text-xs"><SelectValue placeholder="Vyberte..." /></SelectTrigger>
                <SelectContent>
                  {createType === "player_player"
                    ? otherPlayers.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)
                    : createType === "player_ai_faction"
                      ? aiPlayerNames.map(name => {
                          const f = aiFactions.find(af => af.faction_name === name);
                          return <SelectItem key={name} value={name}>{name}{f ? ` (${f.personality})` : ""}</SelectItem>;
                        })
                      : cityStates.map(cs => <SelectItem key={cs.id} value={cs.name}>{cs.name} ({cs.type})</SelectItem>)
                  }
                </SelectContent>
              </Select>
              <Button onClick={handleCreateRoom} size="sm"><Plus className="h-3 w-3 mr-1" />Vytvořit</Button>
            </div>
          </div>
        )}

        {myRooms.length === 0 ? (
          <div className="text-center py-12">
            <Scroll className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground italic font-display">
              Zatím žádné diplomatické kanály. Otevřete první komnatu.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {myRooms.map(room => {
              const otherParticipant = room.participant_a === currentPlayerName ? room.participant_b : room.participant_a;
              const isNpc = room.room_type === "player_npc";
              const isAiFaction = room.room_type === "player_ai_faction";
              return (
                <div
                  key={room.id}
                  onClick={() => setSelectedRoom(room)}
                  className="manuscript-card p-4 cursor-pointer hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isAiFaction ? <Bot className="h-5 w-5 text-primary" /> : isNpc ? <Building2 className="h-5 w-5 text-royal-purple" /> : <Users className="h-5 w-5 text-illuminated" />}
                    <h3 className="font-display font-semibold">{otherParticipant}</h3>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className="text-xs">
                      {isAiFaction ? "AI Frakce" : isNpc ? "Městský stát" : "Hráč"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(room.created_at).toLocaleDateString("cs-CZ")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Chat view
  const otherParticipant = selectedRoom.participant_a === currentPlayerName
    ? selectedRoom.participant_b : selectedRoom.participant_a;
  const isNpcRoom = selectedRoom.room_type === "player_npc";
  const isAiFactionRoom = selectedRoom.room_type === "player_ai_faction";
  // Detect AI faction rooms even if room_type is player_player by looking at
  // ai_factions OR our derived AI player name set (covers broken bootstraps).
  const isAiFactionByName = aiFactions.some(f => f.faction_name === otherParticipant)
    || aiPlayerNames.includes(otherParticipant);
  const canRequestReply = isNpcRoom || isAiFactionRoom || isAiFactionByName;

  // Check if at war with this participant
  const isAtWar = activeWars.some((w: any) =>
    ((w.declaring_player === currentPlayerName && w.target_player === otherParticipant) ||
     (w.declaring_player === otherParticipant && w.target_player === currentPlayerName)) &&
    w.status === "active"
  );
  const hasPeaceOffer = activeWars.some((w: any) =>
    ((w.declaring_player === currentPlayerName && w.target_player === otherParticipant) ||
     (w.declaring_player === otherParticipant && w.target_player === currentPlayerName)) &&
    w.status === "peace_offered"
  );

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedRoom(null)} className="font-display">
            ← Zpět
          </Button>
          <h2 className="font-display font-semibold flex items-center gap-2">
            {isAiFactionRoom ? <Bot className="h-5 w-5 text-primary" /> : isNpcRoom ? <Building2 className="h-5 w-5 text-royal-purple" /> : <Users className="h-5 w-5 text-illuminated" />}
            {otherParticipant}
          </h2>
          {isAtWar && (
            <Badge variant="destructive" className="text-xs font-display">
              ⚔️ VÁLKA
            </Badge>
          )}
          {hasPeaceOffer && (
            <Badge variant="outline" className="text-xs font-display border-accent/50 text-accent">
              🕊️ Mírová nabídka
            </Badge>
          )}
        </div>
        {canRequestReply && loadingNpc && (
          <Badge variant="outline" className="text-xs animate-pulse">
            <Sparkles className="h-3 w-3 mr-1" />Diplomat přemýšlí…
          </Badge>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-2 mb-4">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground italic text-sm">Diplomatická komnata je otevřena. Začněte jednání.</p>
          </div>
        )}
        {messages.map(msg => {
          const isMe = msg.sender === currentPlayerName;
          const isNpc = msg.sender_type === "npc";
          return (
            <div
              key={msg.id}
              className={`flex ${isMe ? "justify-end" : "justify-start"}`}
            >
              <div className={`max-w-[75%] rounded-lg p-3 ${
                isNpc
                  ? "bg-royal-purple/5 border border-royal-purple/20"
                  : isMe
                    ? "bg-primary/10 border border-primary/20"
                    : "bg-muted/50 border border-border"
              }`}
              style={isNpc ? { borderColor: 'hsl(var(--royal-purple) / 0.2)', backgroundColor: 'hsl(var(--royal-purple) / 0.05)' } : {}}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-display font-semibold">{msg.sender}</span>
                  {SECRECY_ICONS[msg.secrecy]}
                  <span className="text-xs text-muted-foreground">{msg.secrecy}</span>
                </div>
                {msg.message_tag && (
                  <Badge variant="outline" className="text-xs mb-1">{TAG_LABELS[msg.message_tag] || msg.message_tag}</Badge>
                )}
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.message_text}</p>
                <span className="text-xs text-muted-foreground mt-1 block">
                  {new Date(msg.created_at).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border pt-3 space-y-2">
        <div className="flex gap-2">
          <Select value={secrecy} onValueChange={setSecrecy}>
            <SelectTrigger className="w-32 h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PUBLIC"><Eye className="h-3 w-3 inline mr-1" />Veřejné</SelectItem>
              <SelectItem value="PRIVATE"><Lock className="h-3 w-3 inline mr-1" />Tajné</SelectItem>
              <SelectItem value="LEAKABLE"><AlertTriangle className="h-3 w-3 inline mr-1" />Únikové</SelectItem>
            </SelectContent>
          </Select>
          <Select value={messageTag} onValueChange={setMessageTag}>
            <SelectTrigger className="w-44 h-9 text-xs"><SelectValue placeholder="Typ zprávy..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Bez značky</SelectItem>
              {Object.entries(TAG_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Napište diplomatickou zprávu..."
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSendMessage()}
            className="flex-1 h-10"
          />
          <Button onClick={handleSendMessage} disabled={!newMessage.trim()} className="font-display">
            <Send className="h-4 w-4 mr-1" />Odeslat
          </Button>
          {canRequestReply && (
            <Button
              onClick={handleNpcReply}
              disabled={loadingNpc || messages.length === 0}
              variant="outline"
              className="font-display border-primary/40 text-primary hover:bg-primary/20"
            >
              <Sparkles className="h-4 w-4 mr-1" />
              {loadingNpc ? "…" : "⚡ AI"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DiplomacyPanel;
