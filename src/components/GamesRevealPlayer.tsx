import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Play, Pause, SkipForward, Trophy, Star, Skull, AlertTriangle, Medal } from "lucide-react";

/** Typewriter that reveals text sentence-by-sentence */
function TypewriterText({ text, speed = 40 }: { text: string; speed?: number }) {
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

  const visible = text.slice(0, charIndex);
  const cursor = charIndex < text.length;

  return (
    <span>
      {visible}
      {cursor && <span className="inline-block w-[2px] h-3 bg-muted-foreground/60 animate-pulse ml-0.5 align-text-bottom" />}
    </span>
  );
}

interface RevealStep {
  seq: number;
  type: string;
  delay_ms: number;
  drama: number;
  text?: string;
  disc_name?: string;
  disc_emoji?: string;
  disc_key?: string;
  standings?: { id: string; name: string; player: string; score: number; rank?: number; medal?: string | null }[];
  winner?: { id: string; name: string; player: string; score: number };
  medals?: Record<string, { gold: number; silver: number; bronze: number }>;
  new_medal?: { empire: string; type: string; athlete: string };
  final_medals?: Record<string, { gold: number; silver: number; bronze: number }>;
  best_athlete?: { name: string; gold: number; silver: number; bronze: number } | null;
  top_empire?: { name: string; score: number } | null;
  legends?: string[];
  ai_commentary?: string;
  athletes_count?: number;
  phase_label?: string;
  empires?: string[];
  incident_type?: string;
  severity?: string;
  victim?: { id: string; name: string; player: string };
  athlete_name?: string;
  gold_count?: number;
}

interface Props {
  revealScript: RevealStep[];
  onComplete?: () => void;
}

const DRAMA_BG: Record<number, string> = {
  1: "bg-muted/30",
  2: "bg-muted/50",
  3: "bg-primary/10 border-primary/20",
  4: "bg-yellow-500/10 border-yellow-500/20",
  5: "bg-red-500/10 border-red-500/20",
};

const GamesRevealPlayer = ({ revealScript, onComplete }: Props) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentMedals, setCurrentMedals] = useState<Record<string, { gold: number; silver: number; bronze: number }>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const visibleSteps = revealScript.slice(0, currentStep + 1);
  const isComplete = currentStep >= revealScript.length - 1;

  const advanceStep = useCallback(() => {
    setCurrentStep(prev => {
      const next = prev + 1;
      if (next >= revealScript.length) {
        setPlaying(false);
        onComplete?.();
        return prev;
      }
      // Update medal table if medal_update or ceremony_close
      const step = revealScript[next];
      if (step?.type === "medal_update" && step.medals) {
        setCurrentMedals(step.medals);
      } else if (step?.type === "ceremony_close" && step.final_medals) {
        setCurrentMedals(step.final_medals);
      }
      return next;
    });
  }, [revealScript, onComplete]);

  useEffect(() => {
    if (!playing || isComplete) return;
    const step = revealScript[currentStep];
    const delay = step?.delay_ms || 2000;
    timerRef.current = setTimeout(advanceStep, delay);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [playing, currentStep, isComplete, advanceStep, revealScript]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [currentStep]);

  const handleSkipAll = () => {
    setPlaying(false);
    setCurrentStep(revealScript.length - 1);
    const lastMedal = [...revealScript].reverse().find(s => s.type === "ceremony_close" || s.type === "medal_update");
    if (lastMedal?.final_medals) setCurrentMedals(lastMedal.final_medals);
    else if (lastMedal?.medals) setCurrentMedals(lastMedal.medals);
    onComplete?.();
  };

  const sortedEmpires = Object.entries(currentMedals)
    .sort((a, b) => (b[1].gold * 100 + b[1].silver * 10 + b[1].bronze) - (a[1].gold * 100 + a[1].silver * 10 + a[1].bronze));

  return (
    <div className="space-y-3">
      {/* Controls */}
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
        <Badge variant="outline" className="text-[8px] ml-auto">{currentStep + 1}/{revealScript.length}</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Event Feed */}
        <Card className="md:col-span-2 border-primary/20 bg-card/50">
          <CardHeader className="pb-1">
            <CardTitle className="font-display text-xs flex items-center gap-1.5">
              <Trophy className="h-3.5 w-3.5 text-primary" />Živý přenos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-80" ref={scrollRef as any}>
              <div className="space-y-1.5 pr-2">
                {visibleSteps.map((step, idx) => (
                  <RevealStepCard key={step.seq} step={step} isLatest={idx === visibleSteps.length - 1} />
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Medal Table */}
        <Card className="border-border bg-card/50">
          <CardHeader className="pb-1">
            <CardTitle className="font-display text-xs flex items-center gap-1.5">
              <Medal className="h-3.5 w-3.5 text-yellow-400" />Medailové pořadí
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sortedEmpires.length === 0 ? (
              <p className="text-[10px] text-muted-foreground text-center py-4">Čekání na výsledky…</p>
            ) : (
              <div className="space-y-1">
                {sortedEmpires.map(([empire, m], idx) => (
                  <div key={empire} className={`flex items-center justify-between text-[10px] py-1.5 px-2 rounded transition-all duration-500 ${idx === 0 ? "bg-primary/10 border border-primary/20" : "bg-muted/30"}`}>
                    <span className="font-display font-semibold">{idx + 1}. {empire}</span>
                    <span className="font-mono">{m.gold}🥇 {m.silver}🥈 {m.bronze}🥉</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

function RevealStepCard({ step, isLatest }: { step: RevealStep; isLatest: boolean }) {
  const bg = isLatest ? DRAMA_BG[step.drama] || "bg-muted/30" : "bg-transparent";

  if (step.type === "ceremony_open" || step.type === "ceremony_close") {
    return (
      <div className={`p-2.5 rounded border ${bg} ${isLatest ? "animate-in fade-in duration-500" : ""}`}>
        <p className="text-[11px] font-display font-semibold">{step.text}</p>
        {step.type === "ceremony_open" && step.empires && (
          <p className="text-[9px] text-muted-foreground mt-0.5">{step.athletes_count} atletů z {step.empires.length} říší</p>
        )}
        {step.type === "ceremony_close" && step.legends && step.legends.length > 0 && (
          <p className="text-[9px] text-yellow-400 mt-0.5">⭐ Legendy: {step.legends.join(", ")}</p>
        )}
      </div>
    );
  }

  if (step.type === "disc_intro") {
    return (
      <div className={`p-2 rounded border-l-2 border-primary/40 ${bg} ${isLatest ? "animate-in fade-in duration-500" : ""}`}>
        <p className="text-[10px] font-display font-semibold text-primary">{step.disc_emoji} {step.disc_name}</p>
      </div>
    );
  }

  if (step.type === "phase_update") {
    return (
      <div className={`p-2 rounded ${bg} ${isLatest ? "animate-in fade-in duration-500" : ""}`}>
        <p className="text-[9px] text-muted-foreground font-display mb-1">{step.phase_label || "Průběžné pořadí"}</p>
        <p className="text-[10px] italic">{step.text}</p>
        {step.standings && (
          <div className="mt-1 space-y-0.5">
            {step.standings.slice(0, 3).map((s, i) => (
              <div key={s.id} className="flex justify-between text-[9px] font-mono">
                <span>{i + 1}. {s.name} ({s.player})</span>
                <span>{s.score}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (step.type === "drama_moment") {
    return (
      <div className={`p-2 rounded border ${bg} ${isLatest ? "animate-in fade-in duration-500" : ""}`}>
        <p className={`text-[10px] font-semibold ${step.drama >= 4 ? "text-yellow-400" : "text-foreground"}`}>{step.text}</p>
      </div>
    );
  }

  if (step.type === "disc_result") {
    return (
      <div className={`p-2.5 rounded border ${bg} ${isLatest ? "animate-in fade-in duration-500" : ""}`}>
        <p className="text-[11px] font-display font-bold text-yellow-400">🏅 {step.text}</p>
        {step.ai_commentary && (
          <p className="text-[9px] italic text-muted-foreground mt-1">
            📜 {isLatest ? <TypewriterText text={step.ai_commentary} speed={25} /> : step.ai_commentary}
          </p>
        )}
        {step.standings && (
          <div className="mt-1.5 space-y-0.5">
            {step.standings.slice(0, 3).map((s) => (
              <div key={s.id} className="flex justify-between text-[9px] font-mono">
                <span>{s.medal === "gold" ? "🥇" : s.medal === "silver" ? "🥈" : "🥉"} {s.name} ({s.player})</span>
                <span>{s.score}</span>
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
          <p className="text-[9px] text-muted-foreground">+1 🥇 {step.new_medal.empire} ({step.new_medal.athlete})</p>
        )}
      </div>
    );
  }

  if (step.type === "incident") {
    return (
      <div className={`p-2 rounded border border-red-500/20 bg-red-500/10 ${isLatest ? "animate-in fade-in duration-500" : ""}`}>
        <div className="flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 text-red-400 shrink-0" />
          <p className="text-[10px] text-red-400">{step.text}</p>
        </div>
      </div>
    );
  }

  if (step.type === "gladiator_death") {
    return (
      <div className={`p-2 rounded border border-red-500/30 bg-red-500/15 ${isLatest ? "animate-in fade-in duration-500" : ""}`}>
        <div className="flex items-center gap-1">
          <Skull className="h-3.5 w-3.5 text-red-500 shrink-0" />
          <p className="text-[10px] font-display font-semibold text-red-500">{step.text}</p>
        </div>
      </div>
    );
  }

  if (step.type === "legend_moment") {
    return (
      <div className={`p-2.5 rounded border border-yellow-500/30 bg-yellow-500/10 ${isLatest ? "animate-in fade-in duration-500" : ""}`}>
        <div className="flex items-center gap-1">
          <Star className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
          <p className="text-[10px] font-display font-bold text-yellow-400">{step.text}</p>
        </div>
      </div>
    );
  }

  // Fallback
  return (
    <div className={`p-1.5 rounded ${bg}`}>
      <p className="text-[10px]">{step.text || JSON.stringify(step.type)}</p>
    </div>
  );
}

export default GamesRevealPlayer;
