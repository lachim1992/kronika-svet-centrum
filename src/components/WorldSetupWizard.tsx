// WorldSetupWizard — Inkrement 3 v9 (premise-first)
//
// Architecture:
//  - Premise textarea + Inspiration cards drive the analyze flow.
//  - translate-premise-to-spec returns a WorldgenSpecV1 (aiSuggestion).
//  - User edits land in `userOverrides`; resolved = deepMerge(suggestion, overrides).
//  - Editor freezes (G5) while requests are in flight (isBusy).
//  - Create disabled until: resolved present, !suggestionStale, !blueprintStale, !busy.

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  type CreateWorldBootstrapResponse,
  type GameMode,
  type TranslatePremiseResponse,
} from "@/types/worldBootstrap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Sparkles, X, Bot, Server, UserPlus, Pen, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { InspirationCards } from "./world-setup/InspirationCards";
import { PremiseAnalyzer } from "./world-setup/PremiseAnalyzer";
import { PreWorldPremiseInput } from "./world-setup/PreWorldPremiseInput";
import { SpecReviewSummary } from "./world-setup/SpecReviewSummary";
import { SpecFieldEditor } from "./world-setup/SpecFieldEditor";
import { BlueprintStaleWarning } from "./world-setup/BlueprintStaleWarning";
import { AdvancedTerrainPanel } from "./world-setup/AdvancedTerrainPanel";
import { SchematicMapPreview, type PreviewHex } from "./world-setup/SchematicMapPreview";
import { LineageSelector } from "./world-setup/LineageSelector";
import {
  BootstrapProgressPanel,
  CANONICAL_BOOTSTRAP_STEPS,
} from "./world-setup/BootstrapProgressPanel";
import type { AncientLayerSpec } from "@/types/ancientLayer";
import CivSetupStep from "./world-setup/CivSetupStep";
import type { WorldIdentityInput } from "@/types/worldBootstrap";

import { useWorldSetupWizardState } from "@/hooks/useWorldSetupWizardState";
import {
  composeAnalyzeRequest,
  composeBlueprintRegenRequest,
  composeBootstrapFromSpec,
  composePreviewFromSpec,
} from "@/lib/worldBootstrapPayload";

const GAME_MODES = [
  { value: "tb_single_ai" as GameMode, label: "🤖 AI Svět", icon: Bot },
  { value: "tb_single_manual" as GameMode, label: "✍️ Ruční", icon: Pen },
  { value: "tb_multi" as GameMode, label: "👥 Multiplayer", icon: UserPlus },
  { value: "time_persistent" as GameMode, label: "🌐 Persistentní", icon: Server },
];

interface Props {
  userId: string;
  defaultPlayerName: string;
  onCreated: (sessionId: string) => void;
  onCancel: () => void;
}

const WorldSetupWizard = ({ userId, defaultPlayerName, onCreated, onCancel }: Props) => {
  const wizard = useWorldSetupWizardState();
  const {
    state,
    resolved,
    lockedPathSet,
    isAnalyzing,
    isRegeneratingBlueprint,
    isBusy,
    setPremise,
    setPreWorldPremise,
    useInspiration,
    editField,
    lockField,
    unlockField,
    setAdvancedOverride,
  } = wizard;

  const [mode, setMode] = useState<GameMode>("tb_single_ai");
  const [playerName, setPlayerName] = useState(defaultPlayerName);

  // Ancient layer (v9.1) — held outside reducer; arrives with analyze response.
  const [ancientLayer, setAncientLayer] = useState<AncientLayerSpec | null>(null);
  const [selectedLineages, setSelectedLineages] = useState<string[]>([]);

  // Civ identity (hostova vlastní civilizace). Zobrazujeme ve všech módech;
  // v MP slouží jako přednastavení host řádku, které pak lobby umí editovat.
  const [identity, setIdentity] = useState<WorldIdentityInput>({
    heraldry: { primary: "#2563eb", secondary: "#fef08a", symbol: "circle" },
    spawnPreference: "any",
    faithAttitude: "tolerant",
  });
  const isMPMode = mode === "tb_multi";

  // Pre-fill rulerName z playerName, dokud ho hráč sám nepřepíše.
  useEffect(() => {
    setIdentity((prev) => {
      if (prev.rulerName && prev.rulerName.trim().length > 0) return prev;
      const name = playerName.trim();
      if (!name) return prev;
      return { ...prev, rulerName: name };
    });
  }, [playerName]);

  // Bootstrap progress
  const [creating, setCreating] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState<number | undefined>(undefined);
  const [receivedSteps, setReceivedSteps] = useState<CreateWorldBootstrapResponse["steps"]>(undefined);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  // Preview
  const [fullPreviewHexes, setFullPreviewHexes] = useState<PreviewHex[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const lastPreviewSignatureRef = useRef<string | null>(null);

  // Invalidate preview if resolved spec changes signature (terrain-relevant fields).
  const previewSignature = useMemo(() => {
    if (!resolved) return null;
    return JSON.stringify({
      seed: resolved.seed,
      size: resolved.userIntent.size,
      terrain: resolved.terrain,
    });
  }, [resolved]);
  useEffect(() => {
    if (previewSignature !== lastPreviewSignatureRef.current) {
      setFullPreviewHexes(null);
    }
  }, [previewSignature]);

  // ── Analyze ──
  async function handleAnalyze() {
    const requestId = crypto.randomUUID();
    const premiseSnapshot = state.premise;
    const preWorldSnapshot = state.preWorldPremise.trim();
    wizard.dispatch({ type: "ANALYZE_START", requestId, premiseSnapshot });
    try {
      const payload = composeAnalyzeRequest({
        premise: premiseSnapshot,
        preWorldPremise: preWorldSnapshot.length >= 30 ? preWorldSnapshot : undefined,
        userOverrides: state.userOverrides,
        lockedPaths: state.lockedPaths,
        regenerationNonce: state.regenerationNonce,
      });
      const { data, error } = await supabase.functions.invoke("translate-premise-to-spec", {
        body: payload,
      });
      if (error) throw new Error(error.message || "Analýza selhala");
      const resp = data as TranslatePremiseResponse & {
        code?: string;
        suggestedPreWorldPremise?: string;
        resolvedPreWorldPremise?: string;
      };
      // Specifická chyba: pradávno se nepodařilo utkat
      if (!resp?.ok && resp?.code === "ANCIENT_LAYER_FAILED") {
        // Pokud AI navrhla preWorld, naplň pole, ať to hráč vidí a může editovat
        if (resp.suggestedPreWorldPremise && preWorldSnapshot.length < 30) {
          setPreWorldPremise(resp.suggestedPreWorldPremise, true, false);
        }
        throw new Error(
          "Mytologii Pradávna se nepodařilo utkat. Uprav premisu nebo vyplň Pradávno ručně a zkus znovu.",
        );
      }
      if (!resp?.ok || !resp.spec) throw new Error(resp?.error || "Analýza vrátila chybu");
      wizard.dispatch({
        type: "ANALYZE_SUCCESS",
        requestId,
        premiseSnapshot,
        spec: resp.spec,
        warnings: resp.warnings ?? [],
      });
      // AI doplnila Pradávno → ulož a označ jako návrh
      if (resp.suggestedPreWorldPremise && preWorldSnapshot.length < 30) {
        setPreWorldPremise(resp.suggestedPreWorldPremise, true, false);
      } else if (resp.resolvedPreWorldPremise && preWorldSnapshot.length >= 30) {
        // potvrzeno hráčovo vlastní
        setPreWorldPremise(resp.resolvedPreWorldPremise, false, false);
      }
      // Capture ancient layer (v9.1) — outside reducer.
      if (resp.ancientLayer) {
        setAncientLayer(resp.ancientLayer);
        // Default selection: first 3 candidates.
        setSelectedLineages(
          resp.ancientLayer.lineage_candidates.slice(0, 3).map((l) => l.id),
        );
      }
      toast.success("Návrh světa připraven");
    } catch (e: any) {
      wizard.dispatch({ type: "ANALYZE_FAIL", requestId, error: e?.message ?? "Chyba" });
      toast.error(e?.message ?? "Analýza selhala");
    }
  }

  // ── Regenerate blueprint ──
  async function handleRegenerateBlueprint() {
    if (!resolved) return;
    const requestId = crypto.randomUUID();
    const nonce = state.regenerationNonce + 1;
    wizard.dispatch({ type: "REGENERATE_BLUEPRINT_START", requestId, nonce });
    try {
      const payload = composeBlueprintRegenRequest({ spec: resolved, regenerationNonce: nonce });
      const { data, error } = await supabase.functions.invoke("translate-premise-to-spec", {
        body: payload,
      });
      if (error) throw new Error(error.message || "Regenerace selhala");
      const resp = data as TranslatePremiseResponse;
      if (!resp?.ok || !resp.spec) throw new Error(resp?.error || "Regenerace vrátila chybu");
      wizard.dispatch({
        type: "REGENERATE_BLUEPRINT_SUCCESS",
        requestId,
        spec: resp.spec,
        warnings: resp.warnings ?? [],
      });
      toast.success("Blueprint regenerován");
    } catch (e: any) {
      wizard.dispatch({ type: "REGENERATE_BLUEPRINT_FAIL", requestId, error: e?.message ?? "Chyba" });
      toast.error(e?.message ?? "Regenerace selhala");
    }
  }

  // ── Full preview ──
  async function handleFullPreview() {
    if (!resolved) return;
    setPreviewLoading(true);
    try {
      const payload = composePreviewFromSpec(resolved);
      const { data, error } = await supabase.functions.invoke("preview-world-map", { body: payload });
      if (error) throw new Error(error.message || "Preview selhal");
      if (!data?.ok) throw new Error(data?.error || "Preview vrátil chybu");
      setFullPreviewHexes(data.hexes as PreviewHex[]);
      lastPreviewSignatureRef.current = previewSignature;
    } catch (e: any) {
      toast.error(e?.message ?? "Preview selhal");
    } finally {
      setPreviewLoading(false);
    }
  }

  // ── Submit (Create) ──
  // Civ identity je vyžadována ve všech módech. V MP slouží jako host přednastavení;
  // ostatní hráči si svoje identity doplní v lobby (přes player_civ_configs).
  const civValid = (
    !!identity.realmName?.trim() &&
    !!identity.settlementName?.trim() &&
    !!identity.rulerName?.trim() &&
    !!identity.secretObjectiveArchetype
  );

  const canSubmit =
    !creating &&
    !!resolved &&
    !state.isSuggestionStale &&
    !state.isBlueprintStale &&
    !isBusy &&
    playerName.trim().length > 0 &&
    civValid;

  async function handleSubmit() {
    if (!resolved) return;
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

      const factionsArr = resolved.factionCount > 0 && mode !== "tb_multi"
        ? Array.from({ length: resolved.factionCount }).map((_, i) => ({
            name: `AI Frakce ${i + 1}`,
            personality: ["aggressive", "diplomatic", "mercantile", "isolationist", "expansionist"][i % 5],
          }))
        : undefined;

      // v9.1: inject ancient_layer with user-selected lineages into spec
      // before bootstrap. world-layer-bootstrap reads it from worldgen_spec.
      const specWithAncient = ancientLayer
        ? {
            ...resolved,
            ancient_layer: { ...ancientLayer, selected_lineages: selectedLineages },
          }
        : resolved;

      const payload = composeBootstrapFromSpec({
        sessionId: session.id,
        playerName: playerName.trim(),
        mode,
        spec: specWithAncient as typeof resolved,
        preWorldPremise: state.preWorldPremise.trim() || undefined,
        factions: factionsArr,
        identity,
      });

      const tickInterval = setInterval(() => {
        setActiveStepIndex((p) => (p === undefined ? 0 : Math.min(p + 1, CANONICAL_BOOTSTRAP_STEPS.length - 1)));
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
        const fullErr = resp.error || "Bootstrap selhal";
        setBootstrapError(fullErr);
        throw new Error(fullErr);
      }
      setActiveStepIndex(CANONICAL_BOOTSTRAP_STEPS.length);
      toast.success(resp.alreadyBootstrapped ? "Svět již existoval" : "Svět vytvořen!");
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

  const advancedOn = state.advancedLockedPaths.length > 0;

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur overflow-y-auto">
      <div className="container max-w-5xl mx-auto p-3 sm:p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Vytvoření světa
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Premisa → AI návrh → úpravy → svět.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onCancel} disabled={creating}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {creating || bootstrapError ? (
          <Card className="p-4 sm:p-6">
            <BootstrapProgressPanel
              receivedSteps={receivedSteps}
              activeIndex={activeStepIndex}
              bootstrapError={bootstrapError}
            />
            {bootstrapError && (
              <div className="flex gap-2 mt-4">
                <Button variant="outline" onClick={() => { setBootstrapError(null); setReceivedSteps(undefined); setActiveStepIndex(undefined); }}>
                  Zpět
                </Button>
              </div>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
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
                        disabled={isBusy}
                        className={`p-2 rounded-md border-2 text-left transition-colors disabled:opacity-50 ${
                          active ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-xs font-medium">
                          <Icon className="h-3.5 w-3.5" />
                          {m.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Card>

              {/* Player name */}
              <Card className="p-3 sm:p-4 space-y-2">
                <Label htmlFor="player-name" className="text-sm">Vaše jméno *</Label>
                <Input
                  id="player-name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Host"
                  disabled={isBusy}
                />
              </Card>

              {/* Inspiration + Premise + Analyze */}
              <Card className="p-3 sm:p-4 space-y-3">
                <Label className="text-sm font-semibold">Inspirace (nepovinné)</Label>
                <InspirationCards
                  selected={state.inspirationUsed}
                  onSelect={(c) => useInspiration(c.premise, c.label)}
                  disabled={isBusy}
                />
                <PremiseAnalyzer
                  premise={state.premise}
                  onPremiseChange={setPremise}
                  onAnalyze={handleAnalyze}
                  isAnalyzing={isAnalyzing}
                  isBusy={isBusy}
                  isSuggestionStale={state.isSuggestionStale}
                  hasSuggestion={!!resolved}
                  analyzeError={state.analyzeError}
                />
                <div className="border-t border-border/60 pt-3">
                  <PreWorldPremiseInput
                    value={state.preWorldPremise}
                    suggested={state.preWorldSuggested}
                    onChange={(v, sugg) => setPreWorldPremise(v, sugg ?? false)}
                    disabled={isBusy}
                  />
                </div>
              </Card>

              {/* Spec review + editor — visible only after first analyze */}
              {resolved && (
                <>
                  <Card className="p-3 sm:p-4 space-y-3">
                    <SpecReviewSummary resolved={resolved} warnings={state.warnings} />
                  </Card>

                  {ancientLayer && (
                    <Card className="p-3 sm:p-4">
                      <LineageSelector
                        ancientLayer={ancientLayer}
                        selected={selectedLineages}
                        onChange={setSelectedLineages}
                      />
                    </Card>
                  )}

                  {state.isBlueprintStale && (
                    <BlueprintStaleWarning
                      isSuggestionStale={state.isSuggestionStale}
                      isBusy={isBusy}
                      isRegenerating={isRegeneratingBlueprint}
                      onRegenerate={handleRegenerateBlueprint}
                      blueprintRegenError={state.blueprintRegenError}
                    />
                  )}

                  <Card className="p-3 sm:p-4">
                    <SpecFieldEditor
                      resolved={resolved}
                      lockedPathSet={lockedPathSet}
                      disabled={isBusy}
                      onEdit={editField}
                      onLockToggle={(p) => (lockedPathSet.has(p) ? unlockField(p) : lockField(p))}
                    />
                  </Card>

                  <Card className="p-3 sm:p-4">
                    <AdvancedTerrainPanel
                      overrideEnabled={advancedOn}
                      onToggle={setAdvancedOverride}
                      disabled={isBusy}
                    />
                  </Card>

                  {/* Civ identity (single + manual). MP řeší v lobby. */}
                  {!isMPMode && (
                    <CivSetupStep
                      value={identity}
                      onChange={setIdentity}
                      premise={state.premise}
                      disabled={isBusy}
                    />
                  )}
                </>
              )}

              {/* Submit */}
              {(() => {
                const blockReason = creating
                  ? null
                  : !playerName.trim()
                  ? "Zadejte své jméno hráče v poli výše."
                  : !resolved
                  ? 'Nejprve klikněte na "Analyzovat premisu" a počkejte, než se vygeneruje návrh světa.'
                  : isBusy
                  ? "Probíhá analýza nebo regenerace blueprintu — počkejte na dokončení."
                  : state.isSuggestionStale
                  ? 'Premisa byla změněna — klikněte znovu na "Analyzovat premisu" pro aktualizaci návrhu.'
                  : state.isBlueprintStale
                  ? 'Blueprint je zastaralý — klikněte na "Regenerovat blueprint" v žluté výstraze výše.'
                  : !civValid
                  ? 'V sekci „Tvá civilizace“ doplň: jméno říše, hlavní sídlo, vládce a tajný cíl (* povinné).'
                  : null;
                return (
                  <div className="sticky bottom-0 bg-background/95 backdrop-blur py-3 -mx-3 px-3 border-t border-border lg:static lg:border-0 lg:bg-transparent lg:mx-0 lg:px-0 space-y-2">
                    {blockReason && (
                      <div className="text-xs text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1.5">
                        ⚠️ {blockReason}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={onCancel} disabled={creating} className="flex-1 sm:flex-none">
                        Zrušit
                      </Button>
                      <Button
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        className="flex-1"
                        size="lg"
                        title={blockReason ?? undefined}
                      >
                        {creating ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Vytvářím…</>
                        ) : (
                          <><Sparkles className="h-4 w-4 mr-2" />Vytvořit svět</>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Preview */}
            <div className="space-y-3 lg:sticky lg:top-3 lg:self-start">
              {resolved ? (
                <>
                  <SchematicMapPreview
                    width={resolved.userIntent.size === "small" ? 21 : resolved.userIntent.size === "large" ? 41 : 31}
                    height={resolved.userIntent.size === "small" ? 21 : resolved.userIntent.size === "large" ? 41 : 31}
                    seed={resolved.seed}
                    targetLandRatio={resolved.terrain.targetLandRatio}
                    continentShape={resolved.terrain.continentShape}
                    mountainDensity={resolved.terrain.mountainDensity}
                    fullPreviewHexes={fullPreviewHexes}
                    isFullPreview={!!fullPreviewHexes}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleFullPreview}
                    disabled={previewLoading || isBusy || state.isBlueprintStale}
                    className="w-full"
                  >
                    {previewLoading ? (
                      <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Generuji…</>
                    ) : "Plný náhled"}
                  </Button>
                  {state.isBlueprintStale && (
                    <p className="text-[10px] text-muted-foreground text-center">
                      Náhled je nedostupný dokud nebude blueprint regenerován.
                    </p>
                  )}
                </>
              ) : (
                <Card className="p-4 text-center text-xs text-muted-foreground">
                  Náhled mapy se zobrazí po analýze premise.
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WorldSetupWizard;
