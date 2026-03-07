import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import {
  Play, Pause, SkipForward, Trophy, Star, Skull, AlertTriangle, Medal,
  Volume2, VolumeX, MessageSquare, Swords, Palette, Shield, Flag
} from "lucide-react";
import { toast } from "sonner";

// ═══ CATEGORY COLORS ═══
const CAT_COLORS: Record<string, { border: string; bg: string; text: string; glow: string }> = {
  physical: { border: "border-red-500/40", bg: "bg-red-500/10", text: "text-red-400", glow: "shadow-red-500/20" },
  cultural: { border: "border-blue-400/40", bg: "bg-blue-400/10", text: "text-blue-400", glow: "shadow-blue-400/20" },
  strategic: { border: "border-emerald-400/40", bg: "bg-emerald-400/10", text: "text-emerald-400", glow: "shadow-emerald-400/20" },
};

const CAT_ICONS: Record<string, typeof Swords> = {
  physical: Swords,
  cultural: Palette,
  strategic: Shield,
};

// ═══ AUDIO SYSTEM (Web Audio API synthesis) ═══
function createCrowdNoise(type: "cheer" | "gasp" | "ambience" | "boo", volume = 0.15, duration = 1.5) {
  try {
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    // Create noise buffer
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      const t = i / ctx.sampleRate;
      if (type === "cheer") {
        // Rising cheering noise
        data[i] = (Math.random() * 2 - 1) * Math.min(1, t * 3) * Math.max(0, 1 - t / duration);
      } else if (type === "gasp") {
        // Sharp short burst
        data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 8);
      } else if (type === "boo") {
        // Low rumble
        data[i] = (Math.random() * 2 - 1) * 0.5 * Math.sin(t * 100) * Math.max(0, 1 - t / duration);
      } else {
        // Ambient murmur
        data[i] = (Math.random() * 2 - 1) * 0.3 * Math.max(0, 1 - t / duration);
      }
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.start();
    source.onended = () => ctx.close();
  } catch (_) {}
}

/** Typewriter that reveals text character-by-character */
function TypewriterText({ text, speed = 30, className = "" }: { text: string; speed?: number; className?: string }) {
  const [charIndex, setCharIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setCharIndex(0);
    intervalRef.current = setInterval(() => {
      setCharIndex(prev => {
        if (prev >= text.length) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return prev;
        }
        return prev + 1;
      });
    }, speed);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [text, speed]);

  return (
    <span className={className}>
      {text.slice(0, charIndex)}
      {charIndex < text.length && <span className="inline-block w-[2px] h-3 bg-primary/60 animate-pulse ml-0.5 align-text-bottom" />}
    </span>
  );
}

/** Crowd reaction bubble */
function CrowdReaction({ reaction, isNew }: { reaction: any; isNew: boolean }) {
  const typeEmoji: Record<string, string> = {
    cheer: "🎉", gasp: "😲", boo: "👎", applause: "👏", silence: "🤫", chant: "📣",
  };
  const intensityBars = "█".repeat(Math.min(reaction.intensity || 1, 5));

  return (
    <div className={`flex items-start gap-1.5 p-1.5 rounded text-[9px] transition-all duration-500 ${isNew ? "animate-in slide-in-from-right-5 bg-primary/5 border border-primary/20" : "opacity-70"}`}>
      <span className="text-sm shrink-0">{typeEmoji[reaction.type] || "👀"}</span>
      <div className="flex-1 min-w-0">
        <p className="text-foreground/80 leading-tight">{reaction.text}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-[7px] text-primary/50 font-mono">{intensityBars}</span>
          <Badge variant="outline" className="text-[6px] h-3 px-1">{reaction.phase}</Badge>
        </div>
      </div>
    </div>
  );
}

// ═══ TYPES ═══
interface RevealStep {
  seq: number; type: string; delay_ms: number; drama: number;
  text?: string; disc_name?: string; disc_emoji?: string; category?: string;
  standings?: any[]; medals?: Record<string, { gold: number; silver: number; bronze: number }>;
  new_medal?: { empire: string; type: string; athlete: string };
  participantCount?: number;
  [key: string]: any;
}

interface DisciplineReveal {
  id: string; discipline_id: string; status: string;
  reveal_script: RevealStep[]; crowd_reactions: any[];
  medal_snapshot: Record<string, { gold: number; silver: number; bronze: number }>;
}

interface Props {
  festivalId: string;
  sessionId: string;
  disciplines: any[];
  isHost: boolean;
  isAdmin?: boolean;
  onComplete?: () => void;
  currentTurn?: number;
}

const GamesRevealPlayer = ({ festivalId, sessionId, disciplines, isHost, isAdmin, onComplete, currentTurn }: Props) => {
  const [disciplineReveals, setDisciplineReveals] = useState<DisciplineReveal[]>([]);
  const [activeDisciplineId, setActiveDisciplineId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentMedals, setCurrentMedals] = useState<Record<string, { gold: number; silver: number; bronze: number }>>({});
  const [crowdReactions, setCrowdReactions] = useState<any[]>([]);
  const [resolvingDisc, setResolvingDisc] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [concluding, setConcluding] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ambienceRef = useRef<HTMLAudioElement | null>(null);

  // Load existing reveals
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("games_discipline_reveals")
        .select("*").eq("festival_id", festivalId) as any;
      if (data) setDisciplineReveals(data);

      // Set medals from latest resolved
      const resolved = (data || []).filter((r: any) => r.status === "resolved");
      if (resolved.length > 0) {
        const latest = resolved[resolved.length - 1];
        if (latest.medal_snapshot) setCurrentMedals(latest.medal_snapshot);
      }
    };
    load();
  }, [festivalId]);

  // Subscribe to Realtime updates on discipline reveals
  useEffect(() => {
    const channel = supabase
      .channel(`games-reveal-${festivalId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "games_discipline_reveals",
        filter: `festival_id=eq.${festivalId}`,
      }, (payload: any) => {
        const newRow = payload.new as DisciplineReveal;
        setDisciplineReveals(prev => {
          const idx = prev.findIndex(r => r.discipline_id === newRow.discipline_id);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = newRow;
            return updated;
          }
          return [...prev, newRow];
        });

        // Auto-start playing when a discipline is resolved (for non-host)
        if (newRow.status === "resolved" && !isHost) {
          setActiveDisciplineId(newRow.discipline_id);
          setCurrentStep(0);
          setPlaying(true);
          setCrowdReactions(newRow.crowd_reactions || []);
          if (newRow.medal_snapshot) setCurrentMedals(newRow.medal_snapshot);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [festivalId, isHost]);

  // Active reveal script
  const activeReveal = disciplineReveals.find(r => r.discipline_id === activeDisciplineId);
  const revealScript = activeReveal?.reveal_script || [];
  const visibleSteps = revealScript.slice(0, currentStep + 1);
  const isComplete = currentStep >= revealScript.length - 1;

  // Playback timer
  const advanceStep = useCallback(() => {
    setCurrentStep(prev => {
      const next = prev + 1;
      if (next >= revealScript.length) {
        setPlaying(false);
        return prev;
      }
      const step = revealScript[next];
      if (step?.type === "medal_update" && step.medals) {
        setCurrentMedals(step.medals);
      }
      // Play sound effect based on drama
      if (!muted && step?.drama >= 3) {
        createCrowdNoise("cheer", 0.2, 1.5);
      } else if (!muted && step?.type === "narrative_line") {
        createCrowdNoise("ambience", 0.05, 2);
      }
      return next;
    });
  }, [revealScript, muted]);

  useEffect(() => {
    if (!playing || isComplete || revealScript.length === 0) return;
    const step = revealScript[currentStep];
    const delay = step?.delay_ms || 2000;
    timerRef.current = setTimeout(advanceStep, delay);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [playing, currentStep, isComplete, advanceStep, revealScript]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [currentStep]);

  // Host starts a discipline
  const handleStartDiscipline = async (discId: string) => {
    setResolvingDisc(discId);
    try {
      const { data, error } = await supabase.functions.invoke("games-resolve-discipline", {
        body: { session_id: sessionId, festival_id: festivalId, discipline_id: discId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Auto-play the result
      setActiveDisciplineId(discId);
      setCurrentStep(0);
      setPlaying(true);
      setCrowdReactions(data.crowd_reactions || []);
      if (data.medal_tally) setCurrentMedals(data.medal_tally);

      if (data.all_resolved) {
        onComplete?.();
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setResolvingDisc(null);
    }
  };

  const handleSkipAll = () => {
    setPlaying(false);
    setCurrentStep(revealScript.length - 1);
    const lastMedal = [...revealScript].reverse().find(s => s.type === "medal_update");
    if (lastMedal?.medals) setCurrentMedals(lastMedal.medals);
  };


  const handleConcludeGames = async () => {
    setConcluding(true);
    try {
      // Find champion from medal tally
      const sorted = Object.entries(currentMedals).sort((a, b) =>
        (b[1].gold * 5 + b[1].silver * 3 + b[1].bronze) - (a[1].gold * 5 + a[1].silver * 3 + a[1].bronze)
      );

      await supabase.from("games_festivals").update({
        status: "concluded",
        concluded_turn: currentTurn || null,
        reveal_phase: "concluded",
      }).eq("id", festivalId);

      toast.success("🏟️ Hry slavnostně uzavřeny!");
      onComplete?.();
    } catch (e: any) {
      toast.error(e.message || "Chyba při uzavírání her");
    } finally {
      setConcluding(false);
    }
  };

  const sortedEmpires = Object.entries(currentMedals)
    .sort((a, b) => (b[1].gold * 100 + b[1].silver * 10 + b[1].bronze) - (a[1].gold * 100 + a[1].silver * 10 + a[1].bronze));

  const allResolved = disciplines.every(d =>
    disciplineReveals.some(r => r.discipline_id === d.id && r.status === "resolved")
  );

  // Batch resolve by category
  const [batchResolving, setBatchResolving] = useState<string | null>(null);
  const handleBatchCategory = async (category: string) => {
    const unresolved = disciplines.filter(d => d.category === category && !disciplineReveals.some(r => r.discipline_id === d.id && r.status === "resolved"));
    if (unresolved.length === 0) return;
    setBatchResolving(category);
    for (const d of unresolved) {
      await handleStartDiscipline(d.id);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    setBatchResolving(null);
  };

  const categories = [...new Set(disciplines.map(d => d.category))];
  const CAT_LABELS: Record<string, string> = { physical: "Fyzické", cultural: "Kulturní", strategic: "Strategické", intellectual: "Intelektuální" };

  return (
    <div className="space-y-3">
      {/* ═══ DISCIPLINE SELECTOR (Host) ═══ */}
      {isHost && (
        <Card className="border-primary/30 bg-card/60 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-xs flex items-center gap-1.5">
              <Trophy className="h-3.5 w-3.5 text-primary" /> Řízení disciplín
              {allResolved && <Badge className="ml-2 bg-green-500/20 text-green-400 text-[8px]">Vše vyhodnoceno</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Batch category buttons */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {categories.map(cat => {
                const catDiscs = disciplines.filter(d => d.category === cat);
                const resolvedCount = catDiscs.filter(d => disciplineReveals.some(r => r.discipline_id === d.id && r.status === "resolved")).length;
                const allCatResolved = resolvedCount === catDiscs.length;
                return (
                  <Button
                    key={cat}
                    size="sm"
                    variant="outline"
                    disabled={allCatResolved || batchResolving === cat}
                    onClick={() => handleBatchCategory(cat)}
                    className={`text-[9px] gap-1 h-6 ${allCatResolved ? "opacity-40" : ""}`}
                  >
                    {batchResolving === cat ? <span className="animate-spin">⏳</span> : null}
                    {CAT_LABELS[cat] || cat} ({resolvedCount}/{catDiscs.length})
                  </Button>
                );
              })}
            </div>
            {/* Individual discipline buttons */}
            <div className="flex flex-wrap gap-1.5">
              {disciplines.map(d => {
                const reveal = disciplineReveals.find(r => r.discipline_id === d.id);
                const isResolved = reveal?.status === "resolved";
                const isResolving = reveal?.status === "resolving" || resolvingDisc === d.id;

                return (
                  <Button
                    key={d.id}
                    size="sm"
                    variant={isResolved ? "outline" : "default"}
                    disabled={isResolved || isResolving}
                    onClick={() => handleStartDiscipline(d.id)}
                    className={`text-[10px] gap-1 h-7 ${isResolved ? "opacity-50" : ""} ${isResolving ? "animate-pulse" : ""}`}
                  >
                    <span>{d.icon_emoji}</span>
                    {d.name}
                    {isResolved && <span className="text-green-400">✓</span>}
                    {isResolving && <span className="animate-spin">⏳</span>}
                  </Button>
                );
              })}
              </div>
              {allResolved && (
                <Button
                  onClick={handleConcludeGames}
                  disabled={concluding}
                  className="w-full mt-3 font-display gap-2"
                >
                  <Flag className="h-4 w-4" />
                  {concluding ? "Uzavírám hry…" : "🏟️ Slavnostně uzavřít hry"}
                </Button>
              )}
          </CardContent>
        </Card>
      )}

      {/* ═══ PLAYBACK CONTROLS ═══ */}
      {activeDisciplineId && revealScript.length > 0 && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant={playing ? "outline" : "default"} onClick={() => setPlaying(!playing)} className="gap-1 font-display text-xs">
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {playing ? "Pauza" : isComplete ? "Hotovo" : "Přehrát"}
          </Button>
          {!isComplete && (
            <Button size="sm" variant="ghost" onClick={handleSkipAll} className="gap-1 text-xs">
              <SkipForward className="h-3.5 w-3.5" />Přeskočit
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setMuted(!muted)} className="text-xs">
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </Button>
          <Badge variant="outline" className="text-[8px] ml-auto">{currentStep + 1}/{revealScript.length}</Badge>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        {/* ═══ MAIN FEED ═══ */}
        <Card className="md:col-span-6 border-primary/20 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-1">
            <CardTitle className="font-display text-xs flex items-center gap-1.5">
              <Trophy className="h-3.5 w-3.5 text-primary" />Živý přenos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-80" ref={scrollRef as any}>
              <div className="space-y-1.5 pr-2">
                {visibleSteps.length === 0 && !activeDisciplineId && (
                  <p className="text-[10px] text-muted-foreground text-center py-8">
                    {isHost ? "Klikněte na disciplínu pro zahájení" : "Čekání na zahájení disciplíny hostitelem…"}
                  </p>
                )}
                {visibleSteps.map((step, idx) => (
                  <RevealStepCard key={`${step.seq}-${idx}`} step={step} isLatest={idx === visibleSteps.length - 1} />
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* ═══ MEDAL TABLE ═══ */}
        <Card className="md:col-span-3 border-border bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-1">
            <CardTitle className="font-display text-xs flex items-center gap-1.5">
              <Medal className="h-3.5 w-3.5 text-yellow-400" />Medaile
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sortedEmpires.length === 0 ? (
              <p className="text-[10px] text-muted-foreground text-center py-4">Čekání na výsledky…</p>
            ) : (
              <div className="space-y-1">
                {sortedEmpires.map(([empire, m], idx) => (
                  <div key={empire} className={`flex items-center justify-between text-[10px] py-1.5 px-2 rounded transition-all duration-700 ${idx === 0 ? "bg-yellow-500/10 border border-yellow-500/20 shadow-sm shadow-yellow-500/10" : "bg-muted/30"}`}>
                    <span className="font-display font-semibold">{idx === 0 ? "👑" : `${idx + 1}.`} {empire}</span>
                    <span className="font-mono">{m.gold}🥇 {m.silver}🥈 {m.bronze}🥉</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ═══ CROWD REACTIONS ═══ */}
        <Card className="md:col-span-3 border-border bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-1">
            <CardTitle className="font-display text-xs flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5 text-primary" />Tribuna
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              {crowdReactions.length === 0 ? (
                <p className="text-[10px] text-muted-foreground text-center py-4">Ticho na tribunách…</p>
              ) : (
                <div className="space-y-1 pr-1">
                  {crowdReactions.map((r, idx) => (
                    <CrowdReaction key={idx} reaction={r} isNew={idx === crowdReactions.length - 1} />
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// ═══ STEP CARD RENDERING ═══
function RevealStepCard({ step, isLatest }: { step: RevealStep; isLatest: boolean }) {
  const cat = step.category || "physical";
  const colors = CAT_COLORS[cat] || CAT_COLORS.physical;
  const CatIcon = CAT_ICONS[cat] || Swords;

  if (step.type === "disc_intro") {
    return (
      <div className={`p-2.5 rounded-lg border-l-4 ${colors.border} ${colors.bg} ${isLatest ? "animate-in fade-in slide-in-from-left-3 duration-500 shadow-lg " + colors.glow : ""}`}>
        <div className="flex items-center gap-1.5">
          <CatIcon className={`h-4 w-4 ${colors.text}`} />
          <p className={`text-sm font-display font-bold ${colors.text}`}>{step.disc_emoji} {step.disc_name}</p>
        </div>
        {step.participantCount && <p className="text-[9px] text-muted-foreground mt-0.5">{step.participantCount} atletů nastupuje</p>}
      </div>
    );
  }

  if (step.type === "narrative_line") {
    const lineColors = CAT_COLORS[step.category || "physical"] || CAT_COLORS.physical;
    return (
      <div className={`p-2 rounded ${isLatest ? "animate-in fade-in duration-500" : ""}`}>
        <p className={`text-[11px] leading-relaxed ${isLatest ? lineColors.text + " font-medium" : "text-foreground/80"}`}>
          {isLatest ? <TypewriterText text={step.text || ""} speed={20} /> : step.text}
        </p>
      </div>
    );
  }

  if (step.type === "disc_result") {
    return (
      <div className={`p-3 rounded-lg border ${colors.border} ${colors.bg} ${isLatest ? "animate-in fade-in scale-in-95 duration-700 shadow-lg " + colors.glow : ""}`}>
        <p className="text-sm font-display font-bold text-yellow-400 mb-1.5">🏅 {step.text}</p>
        {step.standings && (
          <div className="space-y-0.5">
            {step.standings.map((s: any) => (
              <div key={s.id} className="flex justify-between text-[10px] font-mono">
                <span className={s.medal === "gold" ? "text-yellow-400 font-bold" : s.medal === "silver" ? "text-gray-300" : "text-orange-400"}>
                  {s.medal === "gold" ? "🥇" : s.medal === "silver" ? "🥈" : "🥉"} {s.name} ({s.player})
                </span>
                <span className="text-muted-foreground">{s.score}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (step.type === "medal_update") {
    return (
      <div className={`p-1.5 rounded ${isLatest ? "animate-in fade-in duration-500" : ""}`}>
        {step.new_medal && (
          <p className="text-[9px] text-yellow-400/80">
            ✨ {step.new_medal.empire}: +🥇 ({step.new_medal.athlete})
          </p>
        )}
      </div>
    );
  }

  // Fallback
  return (
    <div className={`p-1.5 rounded ${isLatest ? "animate-in fade-in duration-500" : ""}`}>
      <p className="text-[10px] text-foreground/70">{step.text || step.type}</p>
    </div>
  );
}

export default GamesRevealPlayer;
