import { useEffect, useState } from "react";
import { Check, AlertCircle, Loader2, Globe, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface ProgressStep {
  label: string;
  status: "pending" | "active" | "done" | "error";
  error?: string;
}

const FLAVOR_LINES = [
  "Kronikáři zapisují první stránky historie…",
  "Bohové tvarují hory a řeky…",
  "Starší rody se usazují v nových krajinách…",
  "Obchodní stezky se proplétají údolími…",
  "Tajemné ruiny čekají na objevení…",
  "Válečníci brousí meče na úsvitu nové éry…",
  "Diplomaté vyjednávají první spojenectví…",
  "Proroci čtou znamení z hvězd…",
  "Kupci zakládají první tržnice…",
  "Legendy se rodí z mlhy dávných věků…",
  "Řemeslníci stavějí první hradby…",
  "Zvěsti se šíří od města k městu…",
];

interface Props {
  steps: ProgressStep[];
  failed: boolean;
  worldName: string;
  isAIMode: boolean;
  failedSessionId: string | null;
  identityData?: any;
  onRetry: () => void;
  onForceOpen: () => void;
}

const WorldCreationOverlay = ({
  steps,
  failed,
  worldName,
  isAIMode,
  failedSessionId,
  identityData,
  onRetry,
  onForceOpen,
}: Props) => {
  const [flavorIndex, setFlavorIndex] = useState(0);
  const [fadeClass, setFadeClass] = useState("opacity-100");

  const doneCount = steps.filter((s) => s.status === "done").length;
  const progressPercent = steps.length > 0 ? Math.round((doneCount / steps.length) * 100) : 0;

  // Cycle flavor text
  useEffect(() => {
    if (failed) return;
    const interval = setInterval(() => {
      setFadeClass("opacity-0");
      setTimeout(() => {
        setFlavorIndex((prev) => (prev + 1) % FLAVOR_LINES.length);
        setFadeClass("opacity-100");
      }, 400);
    }, 3500);
    return () => clearInterval(interval);
  }, [failed]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: "hsl(224 36% 8% / 0.95)" }}>
      {/* Subtle radial glow */}
      <div className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 50% 40%, hsl(43 64% 52% / 0.06) 0%, transparent 70%)",
        }}
      />

      <div className="relative w-full max-w-md mx-4 space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full border border-primary/30 mb-2"
            style={{ background: "hsl(224 34% 16%)", boxShadow: "0 0 30px hsl(43 64% 52% / 0.15)" }}>
            {failed ? (
              <AlertCircle className="h-8 w-8 text-destructive" />
            ) : (
              <Globe className="h-8 w-8 text-primary animate-pulse" />
            )}
          </div>

          <h2 className="text-xl font-semibold tracking-wide" style={{ fontFamily: "'Cinzel', serif" }}>
            {failed ? "Vytváření selhalo" : isAIMode ? "Generuji AI svět" : "Zakládám svět"}
          </h2>

          <p className="text-sm text-muted-foreground">
            {worldName && <span className="text-primary font-medium">„{worldName}"</span>}
          </p>
        </div>

        {/* Progress bar */}
        {!failed && (
          <div className="space-y-2">
            <Progress value={progressPercent} className="h-2" />
            <p className="text-center text-xs text-muted-foreground tabular-nums">
              {progressPercent}%
            </p>
          </div>
        )}

        {/* Steps list */}
        <div className="space-y-2 p-4 rounded-xl border border-border/50"
          style={{ background: "hsl(224 34% 14%)" }}>
          {steps.map((ps, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                {ps.status === "done" && (
                  <Check className="h-4 w-4 text-green-500" />
                )}
                {ps.status === "active" && (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                )}
                {ps.status === "error" && (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                )}
                {ps.status === "pending" && (
                  <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                )}
              </div>

              <span className={
                ps.status === "error"
                  ? "text-destructive"
                  : ps.status === "done"
                    ? "text-muted-foreground line-through decoration-muted-foreground/30"
                    : ps.status === "active"
                      ? "text-foreground font-medium"
                      : "text-muted-foreground/50"
              }>
                {ps.label}
              </span>

              {ps.error && (
                <span className="text-[10px] text-destructive ml-auto max-w-[140px] truncate">
                  {ps.error}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Post-creation identity report */}
        {!failed && progressPercent === 100 && identityData && (
          <div className="space-y-2 p-4 rounded-xl border border-primary/30"
            style={{ background: "hsl(224 34% 14%)" }}>
            <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Identita vaší civilizace
            </p>
            <p className="text-sm font-bold">{identityData.display_name || "—"}</p>
            {identityData.flavor_summary && (
              <p className="text-xs italic text-muted-foreground">„{identityData.flavor_summary}"</p>
            )}
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] text-muted-foreground">
              {identityData.grain_modifier !== 0 && <p>🌾 Obilí: {identityData.grain_modifier > 0 ? "+" : ""}{Math.round(identityData.grain_modifier * 100)}%</p>}
              {identityData.wood_modifier !== 0 && <p>🪵 Dřevo: {identityData.wood_modifier > 0 ? "+" : ""}{Math.round(identityData.wood_modifier * 100)}%</p>}
              {identityData.stone_modifier !== 0 && <p>⛰️ Kámen: {identityData.stone_modifier > 0 ? "+" : ""}{Math.round(identityData.stone_modifier * 100)}%</p>}
              {identityData.iron_modifier !== 0 && <p>⚙️ Železo: {identityData.iron_modifier > 0 ? "+" : ""}{Math.round(identityData.iron_modifier * 100)}%</p>}
              {identityData.wealth_modifier !== 0 && <p>💰 Bohatství: {identityData.wealth_modifier > 0 ? "+" : ""}{Math.round(identityData.wealth_modifier * 100)}%</p>}
              {identityData.morale_modifier !== 0 && <p>⚔️ Morálka: {identityData.morale_modifier > 0 ? "+" : ""}{identityData.morale_modifier}</p>}
              {identityData.stability_modifier !== 0 && <p>🛡️ Stabilita: {identityData.stability_modifier > 0 ? "+" : ""}{identityData.stability_modifier}</p>}
              {identityData.trade_modifier !== 0 && <p>📈 Obchod: {identityData.trade_modifier > 0 ? "+" : ""}{Math.round(identityData.trade_modifier * 100)}%</p>}
            </div>
            {identityData.building_tags?.length > 0 && (
              <p className="text-[10px] text-muted-foreground">🏗️ Speciální budovy: {identityData.building_tags.join(", ")}</p>
            )}
          </div>
        )}

        {/* Flavor text */}
        {!failed && progressPercent < 100 && (
          <div className="text-center h-8">
            <p className={`text-xs italic text-primary/60 transition-opacity duration-400 ${fadeClass}`}
              style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "14px" }}>
              <Sparkles className="inline h-3 w-3 mr-1.5 -mt-0.5" />
              {FLAVOR_LINES[flavorIndex]}
            </p>
          </div>
        )}

        {/* Error actions */}
        {failed && (
          <div className="flex gap-3 justify-center pt-2">
            <Button onClick={onRetry} className="font-semibold" style={{ fontFamily: "'Cinzel', serif" }}>
              Zkusit znovu
            </Button>
            {failedSessionId && (
              <Button variant="outline" onClick={onForceOpen}>
                Otevřít i přesto
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default WorldCreationOverlay;
