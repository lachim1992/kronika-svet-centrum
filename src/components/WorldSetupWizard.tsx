import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  type CreateWorldBootstrapRequest,
  type CreateWorldBootstrapResponse,
  type WorldSize,
} from "@/types/worldBootstrap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Sparkles,
  X,
  Bot,
  RotateCcw,
  Server,
  UserPlus,
  Pen,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { PresetCards } from "./world-setup/PresetCards";
import {
  SchematicMapPreview,
  type PreviewHex,
} from "./world-setup/SchematicMapPreview";
import {
  AdvancedTerrainPanel,
  type AdvancedTerrainState,
} from "./world-setup/AdvancedTerrainPanel";
import { WorldSummaryPanel } from "./world-setup/WorldSummaryPanel";
import {
  BootstrapProgressPanel,
  CANONICAL_BOOTSTRAP_STEPS,
} from "./world-setup/BootstrapProgressPanel";
import {
  DEFAULT_PRESET_ID,
  WORLD_PRESETS,
  getPreset,
  type PresetId,
} from "@/lib/worldPresets";
import { useWizardDirtyState } from "@/hooks/useWizardDirtyState";
import {
  composeBootstrapPayload,
  composePreviewPayload,
  type WizardCanonicalState,
} from "@/lib/worldBootstrapPayload";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const GAME_MODES = [
  { value: "tb_single_ai", label: "🤖 AI Svět", icon: Bot, desc: "AI generuje svět a frakce." },
  { value: "tb_single_manual", label: "✍️ Ruční svět", icon: Pen, desc: "Vy nastavujete vše ručně." },
  { value: "tb_multi", label: "👥 Multiplayer", icon: UserPlus, desc: "2–10 hráčů, AI kronikář." },
  { value: "time_persistent", label: "🌐 Persistentní", icon: Server, desc: "Reálný čas, svět žije sám." },
];

const SIZE_OPTIONS: Array<{ value: WorldSize; label: string; desc: string; w: number; h: number }> = [
  { value: "small", label: "Malý", desc: "21×21 hexů, rychlá hra", w: 21, h: 21 },
  { value: "medium", label: "Střední", desc: "31×31 hexů, vyvážený", w: 31, h: 31 },
  { value: "large", label: "Velký", desc: "41×41 hexů, dlouhá kampaň", w: 41, h: 41 },
];

const TONES = [
  { value: "realistic", label: "📜 Realistický" },
  { value: "mythic", label: "🏛️ Mýtický" },
  { value: "dark_fantasy", label: "🌑 Dark Fantasy" },
  { value: "heroic", label: "⚔️ Hrdinský" },
  { value: "grim", label: "💀 Drsný" },
];

const VICTORY_STYLES = [
  { value: "story", label: "📖 Příběh" },
  { value: "domination", label: "⚔️ Dominace" },
  { value: "survival", label: "🛡️ Přežití" },
  { value: "sandbox", label: "🌍 Sandbox" },
];

const PREMISE_MIN = 20;

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  userId: string;
  defaultPlayerName: string;
  onCreated: (sessionId: string) => void;
  onCancel: () => void;
}

const WorldSetupWizard = ({ userId, defaultPlayerName, onCreated, onCancel }: Props) => {
  // ── Dirty-state tracker (R2) ────────────────────────────────────────────
  const dirty = useWizardDirtyState();

  // ── Preset (canonical default-source) ───────────────────────────────────
  const [presetId, setPresetId] = useState<PresetId>(DEFAULT_PRESET_ID);
  const initialPreset = getPreset(DEFAULT_PRESET_ID);

  // ── Core wizard state ───────────────────────────────────────────────────
  const [mode, setMode] = useState("tb_single_ai");
  const [worldName, setWorldName] = useState("");
  const [premise, setPremise] = useState("");
  const [tone, setTone] = useState(initialPreset.defaults.tone);
  const [victoryStyle, setVictoryStyle] = useState(initialPreset.defaults.victoryStyle);
  const [size, setSize] = useState<WorldSize>(initialPreset.defaults.size);
  const [aiFactionsCount, setAiFactionsCount] = useState(3);
  const [playerName, setPlayerName] = useState(defaultPlayerName);

  // ── Advanced state (terrain + override) ─────────────────────────────────
  const sizeConfig = useMemo(
    () => SIZE_OPTIONS.find((s) => s.value === size) ?? SIZE_OPTIONS[1],
    [size],
  );
  const [advanced, setAdvanced] = useState<AdvancedTerrainState>({
    overrideEnabled: false,
    customWidth: sizeConfig.w,
    customHeight: sizeConfig.h,
    customSeed: "",
    targetLandRatio: initialPreset.defaults.terrain.targetLandRatio,
    continentShape: initialPreset.defaults.terrain.continentShape,
    continentCount: initialPreset.defaults.terrain.continentCount,
    mountainDensity: initialPreset.defaults.terrain.mountainDensity,
  });

  // Keep customWidth/Height in sync with chosen size (only when override is OFF).
  useEffect(() => {
    if (!advanced.overrideEnabled) {
      setAdvanced((p) => ({ ...p, customWidth: sizeConfig.w, customHeight: sizeConfig.h }));
    }
  }, [sizeConfig.w, sizeConfig.h, advanced.overrideEnabled]);

  // ── Seed (canonical) ────────────────────────────────────────────────────
  const [seed, setSeed] = useState<string>(() => crypto.randomUUID());

  const effectiveSeed = advanced.overrideEnabled && advanced.customSeed.trim()
    ? advanced.customSeed.trim()
    : seed;

  // ── Preview state ───────────────────────────────────────────────────────
  const [fullPreviewHexes, setFullPreviewHexes] = useState<PreviewHex[] | null>(null);
  const [fullPreviewMeta, setFullPreviewMeta] = useState<{
    mapWidth: number;
    mapHeight: number;
    seed: string;
    estimatedStartPositions: number;
    landRatioResolved: number;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Invalidate full preview whenever any canonical input changes.
  useEffect(() => {
    setFullPreviewHexes(null);
    setFullPreviewMeta(null);
    setPreviewError(null);
  }, [
    size,
    effectiveSeed,
    advanced.overrideEnabled,
    advanced.customWidth,
    advanced.customHeight,
    advanced.targetLandRatio,
    advanced.continentShape,
    advanced.continentCount,
    advanced.mountainDensity,
  ]);

  // ── Submit / progress ───────────────────────────────────────────────────
  const [creating, setCreating] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState<number | undefined>(undefined);
  const [receivedSteps, setReceivedSteps] = useState<CreateWorldBootstrapResponse["steps"]>(undefined);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  // ── Derived: canonical wizard state for payload composer ────────────────
  const canonicalState: WizardCanonicalState = useMemo(
    () => ({
      sessionId: "", // filled at submit time
      playerName: playerName.trim() || "Host",
      mode: mode as CreateWorldBootstrapRequest["mode"],
      worldName: worldName.trim(),
      premise: premise.trim(),
      tone,
      victoryStyle,
      size,
      seed: effectiveSeed,
      advancedOverrideEnabled: advanced.overrideEnabled,
      customWidth: advanced.customWidth,
      customHeight: advanced.customHeight,
      targetLandRatio: advanced.targetLandRatio,
      continentShape: advanced.continentShape,
      continentCount: advanced.continentCount,
      mountainDensity: advanced.mountainDensity,
    }),
    [
      playerName, mode, worldName, premise, tone, victoryStyle, size, effectiveSeed,
      advanced,
    ],
  );

  // ── Preset handling (R2: dirty-aware) ───────────────────────────────────
  function applyPreset(id: PresetId, force = false) {
    const preset = getPreset(id);
    setPresetId(id);
    // Only overwrite fields that are not dirty (or all if forced).
    if (force || !dirty.isDirty("tone")) {
      dirty.suppressNext("tone");
      setTone(preset.defaults.tone);
    }
    if (force || !dirty.isDirty("victoryStyle")) {
      dirty.suppressNext("victoryStyle");
      setVictoryStyle(preset.defaults.victoryStyle);
    }
    if (force || !dirty.isDirty("size")) {
      dirty.suppressNext("size");
      setSize(preset.defaults.size);
    }
    // Terrain knobs are grouped under one dirty key for simplicity.
    if (force || !dirty.isDirty("terrain")) {
      setAdvanced((p) => ({
        ...p,
        targetLandRatio: preset.defaults.terrain.targetLandRatio,
        continentShape: preset.defaults.terrain.continentShape,
        continentCount: preset.defaults.terrain.continentCount,
        mountainDensity: preset.defaults.terrain.mountainDensity,
      }));
    }
    if (force) {
      dirty.resetAll();
    }
  }

  function handleResetToPreset() {
    applyPreset(presetId, true);
    toast.success("Hodnoty resetovány podle presetu");
  }

  function regenerateSeed() {
    setSeed(crypto.randomUUID());
  }

  // ── Full preview call ───────────────────────────────────────────────────
  async function handleFullPreview() {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const payload = composePreviewPayload(canonicalState);
      const { data, error } = await supabase.functions.invoke("preview-world-map", {
        body: payload,
      });
      if (error) throw new Error(error.message || "Preview selhal");
      if (!data?.ok) throw new Error(data?.error || "Preview vrátil chybu");
      setFullPreviewHexes(data.hexes as PreviewHex[]);
      setFullPreviewMeta({
        mapWidth: data.mapWidth,
        mapHeight: data.mapHeight,
        seed: data.seed,
        estimatedStartPositions: data.estimatedStartPositions,
        landRatioResolved: data.landRatioResolved,
      });
    } catch (e: any) {
      const msg = e?.message || "Preview selhal";
      setPreviewError(msg);
      toast.error(msg);
    } finally {
      setPreviewLoading(false);
    }
  }

  // ── Submit ──────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!worldName.trim()) {
      toast.error("Zadejte název světa");
      return;
    }
    if (premise.trim().length < PREMISE_MIN) {
      toast.error(`Premisa musí mít alespoň ${PREMISE_MIN} znaků`);
      return;
    }
    if (!playerName.trim()) {
      toast.error("Zadejte jméno hráče");
      return;
    }

    setCreating(true);
    setBootstrapError(null);
    setReceivedSteps([]);
    setActiveStepIndex(0);

    let sessionId: string | null = null;
    try {
      // Step pre-A: create session row (so the orchestrator has a sessionId).
      const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const { data: session, error: sessErr } = await supabase
        .from("game_sessions")
        .insert({
          room_code: roomCode,
          player1_name: playerName.trim(),
          max_players: mode === "tb_multi" ? 10 : mode === "time_persistent" ? 50 : 1,
          created_by: userId,
          game_mode: mode,
          tier: "premium",
          init_status: mode === "tb_multi" ? "lobby" : "initializing",
        } as any)
        .select()
        .single();
      if (sessErr || !session) throw sessErr || new Error("Vytvoření relace selhalo");
      sessionId = session.id;

      // Game player + membership
      await supabase.from("game_players").insert({
        session_id: session.id,
        player_name: playerName.trim(),
        player_number: 1,
        user_id: userId,
      } as any);
      await supabase.from("game_memberships").insert({
        user_id: userId,
        session_id: session.id,
        player_name: playerName.trim(),
        role: "admin",
        setup_status: mode === "tb_multi" ? "pending" : "ready",
      } as any);

      // Build canonical bootstrap payload via the composer.
      const stateWithSession: WizardCanonicalState = {
        ...canonicalState,
        sessionId: session.id,
        factions: aiFactionsCount > 0 && mode !== "tb_multi"
          ? Array.from({ length: aiFactionsCount }).map((_, i) => ({
              name: `AI Frakce ${i + 1}`,
              personality: ["aggressive", "diplomatic", "mercantile", "isolationist", "expansionist"][i % 5],
            }))
          : undefined,
      };
      const payload = composeBootstrapPayload(stateWithSession);

      // Tick activeStepIndex while we wait. The orchestrator runs synchronously,
      // so we just advance through canonical steps every ~600ms as a UX hint
      // until the response lands; receivedSteps then reveals the truth.
      const tickInterval = setInterval(() => {
        setActiveStepIndex((prev) => {
          if (prev === undefined) return 0;
          return Math.min(prev + 1, CANONICAL_BOOTSTRAP_STEPS.length - 1);
        });
      }, 800);

      const { data: bootstrapData, error: bootstrapErr } = await supabase.functions.invoke(
        "create-world-bootstrap",
        { body: payload },
      );

      clearInterval(tickInterval);

      if (bootstrapErr) throw new Error(bootstrapErr.message || "Bootstrap selhal");
      const resp = bootstrapData as CreateWorldBootstrapResponse;
      setReceivedSteps(resp.steps);

      if (!resp.ok) {
        // Fetch DB error if available
        const { data: wf } = await supabase
          .from("world_foundations")
          .select("bootstrap_error")
          .eq("session_id", session.id)
          .maybeSingle();
        const dbErr = (wf as any)?.bootstrap_error;
        const fullErr = dbErr || resp.error || "Bootstrap selhal";
        setBootstrapError(fullErr);
        throw new Error(fullErr);
      }

      setActiveStepIndex(CANONICAL_BOOTSTRAP_STEPS.length);
      toast.success(
        resp.alreadyBootstrapped ? "Svět již existoval" : "Svět vytvořen!",
      );
      onCreated(session.id);
    } catch (e: any) {
      console.error("[wizard] submit failed:", e);
      const msg = e?.message || "Vytvoření světa selhalo";
      if (!bootstrapError) setBootstrapError(msg);
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }

  // ── Validation ──────────────────────────────────────────────────────────
  const premiseLen = premise.trim().length;
  const canSubmit =
    !creating &&
    worldName.trim().length > 0 &&
    premiseLen >= PREMISE_MIN &&
    playerName.trim().length > 0;

  const currentPreset = getPreset(presetId);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur overflow-y-auto">
      <div className="container max-w-5xl mx-auto p-3 sm:p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Vytvoření světa
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Nastavte základ své kroniky.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onCancel} disabled={creating}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Creation in progress: show step panel */}
        {creating || bootstrapError ? (
          <Card className="p-4 sm:p-6">
            <BootstrapProgressPanel
              receivedSteps={receivedSteps}
              activeIndex={activeStepIndex}
              bootstrapError={bootstrapError}
            />
            {bootstrapError && (
              <div className="flex gap-2 mt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setBootstrapError(null);
                    setReceivedSteps(undefined);
                    setActiveStepIndex(undefined);
                  }}
                >
                  Zpět
                </Button>
              </div>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
            {/* ── LAYER A: Simple form ─────────────────────────────────── */}
            <div className="space-y-4">
              {/* Mode */}
              <Card className="p-3 sm:p-4 space-y-2">
                <Label className="text-sm font-semibold">Herní režim</Label>
                <div className="grid grid-cols-2 gap-2">
                  {GAME_MODES.map((m) => {
                    const Icon = m.icon;
                    const active = mode === m.value;
                    return (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => setMode(m.value)}
                        className={`p-2 rounded-md border-2 text-left transition-colors ${
                          active
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-xs font-medium">
                          <Icon className="h-3.5 w-3.5" />
                          {m.label}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                          {m.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Card>

              {/* Preset cards */}
              <Card className="p-3 sm:p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Předvolba světa</Label>
                  {dirty.hasAnyDirty() && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleResetToPreset}
                      className="h-7 text-xs"
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Reset podle presetu
                    </Button>
                  )}
                </div>
                <PresetCards
                  selected={presetId}
                  onSelect={(id) => applyPreset(id, false)}
                  disabled={creating}
                />
              </Card>

              {/* Identity */}
              <Card className="p-3 sm:p-4 space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="world-name" className="text-sm">Název světa *</Label>
                  <Input
                    id="world-name"
                    value={worldName}
                    onChange={(e) => setWorldName(e.target.value)}
                    placeholder="např. Středosvět"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="player-name" className="text-sm">Vaše jméno *</Label>
                  <Input
                    id="player-name"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Host"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between">
                    <Label htmlFor="premise" className="text-sm">
                      Premisa světa *
                    </Label>
                    <span
                      className={`text-[10px] ${
                        premiseLen >= PREMISE_MIN ? "text-muted-foreground" : "text-destructive"
                      }`}
                    >
                      {premiseLen}/{PREMISE_MIN} znaků
                    </span>
                  </div>
                  <Textarea
                    id="premise"
                    value={premise}
                    onChange={(e) => setPremise(e.target.value)}
                    placeholder={currentPreset.defaults.premisePlaceholder}
                    rows={4}
                    className="resize-none"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Krátký popis světa — kontext pro AI kronikáře.
                  </p>
                </div>
              </Card>

              {/* Size, Tone, Victory, AI count */}
              <Card className="p-3 sm:p-4 space-y-3">
                <div className="space-y-1">
                  <Label className="text-sm">Velikost</Label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {SIZE_OPTIONS.map((opt) => {
                      const active = size === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            dirty.markDirty("size");
                            setSize(opt.value);
                          }}
                          className={`p-2 rounded-md border-2 text-center transition-colors ${
                            active
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          <div className="text-xs font-semibold">{opt.label}</div>
                          <div className="text-[9px] text-muted-foreground mt-0.5">
                            {opt.desc}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-sm">Styl světa</Label>
                    <Select
                      value={tone}
                      onValueChange={(v) => {
                        dirty.markDirty("tone");
                        setTone(v);
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TONES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-sm">Herní zaměření</Label>
                    <Select
                      value={victoryStyle}
                      onValueChange={(v) => {
                        dirty.markDirty("victoryStyle");
                        setVictoryStyle(v);
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {VICTORY_STYLES.map((v) => (
                          <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between">
                    <Label className="text-sm">Počet AI frakcí</Label>
                    <Badge variant="outline">{aiFactionsCount}</Badge>
                  </div>
                  <Slider
                    min={0}
                    max={6}
                    step={1}
                    value={[aiFactionsCount]}
                    onValueChange={(v) => setAiFactionsCount(v[0])}
                  />
                </div>
              </Card>

              {/* ── LAYER C: Advanced (collapsible) ──────────────────── */}
              <Card className="p-3 sm:p-4">
                <AdvancedTerrainPanel
                  state={advanced}
                  onChange={(next) => {
                    setAdvanced((p) => ({ ...p, ...next }));
                    // Mark terrain knobs dirty if the user touches them
                    if (
                      next.targetLandRatio !== undefined ||
                      next.continentShape !== undefined ||
                      next.continentCount !== undefined ||
                      next.mountainDensity !== undefined
                    ) {
                      dirty.markDirty("terrain");
                    }
                  }}
                  defaultWidth={sizeConfig.w}
                  defaultHeight={sizeConfig.h}
                />
              </Card>

              {/* Submit */}
              <div className="flex gap-2 sticky bottom-0 bg-background/95 backdrop-blur py-3 -mx-3 px-3 border-t border-border lg:static lg:border-0 lg:bg-transparent lg:backdrop-blur-0 lg:mx-0 lg:px-0">
                <Button variant="outline" onClick={onCancel} disabled={creating} className="flex-1 sm:flex-none">
                  Zrušit
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="flex-1"
                  size="lg"
                >
                  {creating ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Vytvářím…</>
                  ) : (
                    <><Sparkles className="h-4 w-4 mr-2" />Vytvořit svět</>
                  )}
                </Button>
              </div>
            </div>

            {/* ── LAYER B: Preview side panel ──────────────────────────── */}
            <div className="space-y-3 lg:sticky lg:top-3 lg:self-start">
              <SchematicMapPreview
                width={advanced.overrideEnabled ? advanced.customWidth : sizeConfig.w}
                height={advanced.overrideEnabled ? advanced.customHeight : sizeConfig.h}
                seed={effectiveSeed}
                targetLandRatio={advanced.targetLandRatio}
                continentShape={advanced.continentShape}
                mountainDensity={advanced.mountainDensity}
                fullPreviewHexes={fullPreviewHexes}
                isFullPreview={!!fullPreviewHexes}
              />
              <WorldSummaryPanel
                mapWidth={advanced.overrideEnabled ? advanced.customWidth : sizeConfig.w}
                mapHeight={advanced.overrideEnabled ? advanced.customHeight : sizeConfig.h}
                resolvedFromAdvanced={advanced.overrideEnabled}
                seed={effectiveSeed}
                estimatedStartPositions={Math.max(2, Math.min(8, aiFactionsCount + 1))}
                landRatioEstimated={advanced.targetLandRatio}
                resolvedFromFullPreview={fullPreviewMeta}
                onRegenerateSeed={regenerateSeed}
                onFullPreview={handleFullPreview}
                fullPreviewLoading={previewLoading}
                fullPreviewError={previewError}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WorldSetupWizard;
