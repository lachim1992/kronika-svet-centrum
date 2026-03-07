import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skull, Loader2, BookOpen, Sparkles, ImageIcon, RefreshCw, Pencil, Save, X } from "lucide-react";
import { toast } from "sonner";
import type { DeadPlayer } from "./InMemoriamTab";
import { POS_FULL } from "./InMemoriamTab";

interface Props {
  player: DeadPlayer;
  sessionId: string;
  currentPlayerName: string;
  isAdmin: boolean;
  onEntityClick?: (type: string, id: string, name: string) => void;
  onRefresh: () => Promise<void>;
}

export default function MemoriamCard({ player: p, sessionId, currentPlayerName, isAdmin, onEntityClick, onRefresh }: Props) {
  const [generatingId, setGeneratingId] = useState(false);
  const [writingId, setWritingId] = useState(false);
  const [generatingText, setGeneratingText] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");

  const handleGenerateStatue = async (extraPrompt?: string) => {
    setGeneratingId(true);
    try {
      const posePhrases: Record<string, string> = {
        striker: "in a dynamic shooting stance, one arm pulled back ready to hurl the Sphaera ball forward, legs wide in athletic stride",
        guardian: "in a defensive crouch, arms spread wide protecting goal area, muscular legs planted firmly, holding the heavy Sphaera ball against chest",
        carrier: "mid-sprint carrying the Sphaera ball tucked under one arm, other arm outstretched for balance, lean athletic build",
        praetor: "standing tall as team captain, one foot on the Sphaera ball, pointing forward commandingly, wearing a captain's armband",
        exactor: "in an aggressive tackling pose, low center of gravity, arms reaching forward to intercept, powerful build",
      };
      const pose = posePhrases[p.position] || "holding a heavy metal Sphaera ball in one hand, standing in a heroic athletic pose";
      const basePrompt = `A grand bronze memorial statue of "${p.name}", a fallen Sphaera ${POS_FULL[p.position] || p.position} athlete. The statue depicts the athlete ${pose}. The figure wears a light ancient athletic tunic and leather sandals (NOT heavy armor, NOT a warrior). The heavy metal Sphaera ball is prominently featured. Set in a memorial garden beside an ancient oval arena, with eternal torches and laurel wreaths. Bronze plaque at the base reads "${p.name}". Classical Greco-Roman athletic monument style, solemn and dignified. Ultra high resolution.`;
      const prompt = extraPrompt ? `${basePrompt} Additional details: ${extraPrompt}` : basePrompt;

      const { data, error } = await supabase.functions.invoke("encyclopedia-image", {
        body: {
          entityType: "person",
          entityName: p.name,
          entityId: p.id,
          sessionId,
          imagePrompt: prompt,
          createdBy: currentPlayerName,
          description: `${p.name}, ${POS_FULL[p.position] || p.position} týmu ${p.team_name}. Padl v ${p.death_turn}. kole.`,
        },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }

      if (data?.imageUrl) {
        // Save version history
        await supabase.from("wiki_entry_versions" as any).insert({
          wiki_entry_id: p.id,
          session_id: sessionId,
          field_changed: "image",
          old_image_url: p.portrait_url,
          new_image_url: data.imageUrl,
          image_custom_prompt: extraPrompt || null,
          changed_by: currentPlayerName,
          change_reason: extraPrompt ? "Admin re-prompt" : "Generate statue",
        });

        await supabase.from("league_players")
          .update({ portrait_url: data.imageUrl } as any)
          .eq("id", p.id);
      }

      toast.success(`🗿 Pamětní socha ${p.name} odhalena!`);
      setEditingPrompt(false);
      setCustomPrompt("");
      await onRefresh();
    } catch (e) {
      console.error(e);
      toast.error("Generování sochy selhalo");
    }
    setGeneratingId(false);
  };

  const handleGenerateRichText = async () => {
    setGeneratingText(true);
    try {
      const { data, error } = await supabase.functions.invoke("memoriam-generate", {
        body: { player: p, sessionId },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }

      // Build rich wiki entry
      const wikiData: Record<string, unknown> = {
        session_id: sessionId,
        entity_type: "person",
        entity_id: p.id,
        entity_name: p.name,
        owner_player: p.owner_player || "unknown",
        summary: data.summary,
        ai_description: data.nekrolog,
        image_url: p.portrait_url || null,
        tags: ["Sphaera", POS_FULL[p.position] || p.position, "In Memoriam", p.team_name],
      };

      const { data: existing } = await supabase
        .from("wiki_entries")
        .select("id, ai_description")
        .eq("session_id", sessionId)
        .eq("entity_type", "person")
        .eq("entity_id", p.id)
        .maybeSingle();

      if (existing) {
        // Save version
        await supabase.from("wiki_entry_versions" as any).insert({
          wiki_entry_id: existing.id,
          session_id: sessionId,
          field_changed: "ai_description",
          old_value: existing.ai_description || null,
          new_value: data.nekrolog,
          changed_by: currentPlayerName,
          change_reason: "AI memoriam generate",
        });
        await supabase.from("wiki_entries").update(wikiData as any).eq("id", existing.id);
      } else {
        await supabase.from("wiki_entries").insert(wikiData as any);
      }

      // Also update bio on the player record
      await supabase.from("league_players")
        .update({ bio: data.epitaf } as any)
        .eq("id", p.id);

      toast.success(`📜 ${p.name} — nekrolog zapsán do ChroWiki!`);
      if (onEntityClick) onEntityClick("person", p.id, p.name);
      await onRefresh();
    } catch (e) {
      console.error(e);
      toast.error("Generování nekrologu selhalo");
    }
    setGeneratingText(false);
  };

  const handleWriteBasicToChroWiki = async () => {
    setWritingId(true);
    try {
      const summary = [
        `${p.name} — ${POS_FULL[p.position] || p.position} týmu ${p.team_name} z města ${p.city_name}.`,
        `Odehrál ${p.matches_played} zápasů, vstřelil ${p.goals_scored} gólů.`,
        p.match_opponent
          ? `Padl v ${p.death_turn}. kole v zápase proti ${p.match_opponent} (${p.match_score}).`
          : `Padl v ${p.death_turn}. kole.`,
        p.killer_name ? `Smrtelný úder zasadil ${p.killer_name}.` : "",
        p.death_minute ? `K tragédii došlo v ${p.death_minute}. minutě.` : "",
        p.death_cause || "",
      ].filter(Boolean).join(" ");

      const wikiData: Record<string, unknown> = {
        session_id: sessionId,
        entity_type: "person",
        entity_id: p.id,
        entity_name: p.name,
        owner_player: p.owner_player || "unknown",
        summary,
        ai_description: summary,
        image_url: p.portrait_url || null,
        tags: ["Sphaera", POS_FULL[p.position] || p.position, "In Memoriam", p.team_name],
      };

      const { data: existing } = await supabase
        .from("wiki_entries")
        .select("id")
        .eq("session_id", sessionId)
        .eq("entity_type", "person")
        .eq("entity_id", p.id)
        .maybeSingle();

      if (existing) {
        await supabase.from("wiki_entries").update(wikiData as any).eq("id", existing.id);
      } else {
        await supabase.from("wiki_entries").insert(wikiData as any);
      }

      toast.success(`📜 ${p.name} zapsán do ChroWiki!`);
      if (onEntityClick) onEntityClick("person", p.id, p.name);
    } catch (e) {
      console.error(e);
      toast.error("Zápis do ChroWiki selhal");
    }
    setWritingId(false);
  };

  return (
    <div className="p-3 hover:bg-accent/5 transition-colors">
      <div className="flex gap-3">
        {/* Portrait / Statue */}
        <div className="shrink-0 w-16 h-20 rounded-md overflow-hidden border border-border bg-muted/20">
          {p.portrait_url ? (
            <img src={p.portrait_url} alt={p.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Skull className="h-6 w-6 text-red-400/30" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-sm">{p.name}</span>
            <Skull className="h-3.5 w-3.5 text-red-400" />
            <Badge variant="outline" className="text-[9px]">{POS_FULL[p.position] || p.position}</Badge>
          </div>

          <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color_primary }} />
              {p.team_name}
            </span>
            <span>📍 {p.city_name}</span>
            <span>({p.owner_player})</span>
          </div>

          {/* Bio / epitaf - zlatý text */}
          {p.bio && (
            <p className="text-[10px] italic leading-relaxed" style={{ color: 'hsl(var(--primary))' }}>
              „{p.bio}"
            </p>
          )}

          <div className="text-[10px] text-muted-foreground space-y-0.5">
            <div>⚔️ {p.matches_played} zápasů · ⚽ {p.goals_scored} gólů</div>
            <div className="text-red-300/80">
              † Kolo {p.death_turn}
              {p.match_opponent && <> · vs {p.match_opponent} ({p.match_score})</>}
              {p.death_minute && <> · {p.death_minute}. minuta</>}
              {p.killer_name && <> · smrtelný úder: <span className="font-medium text-red-400">{p.killer_name}</span></>}
            </div>
            {p.death_cause && <div className="italic text-muted-foreground/60">{p.death_cause}</div>}
          </div>

          {/* Actions row 1: Primary */}
          <div className="flex gap-2 mt-2 flex-wrap">
            <Button
              size="sm"
              variant="default"
              className="text-[10px] h-7 gap-1"
              disabled={generatingText}
              onClick={handleGenerateRichText}
            >
              {generatingText ? (
                <><Loader2 className="h-3 w-3 animate-spin" />Generuji nekrolog...</>
              ) : (
                <><Sparkles className="h-3 w-3" />AI Nekrolog → ChroWiki</>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-[10px] h-7 gap-1"
              disabled={generatingId}
              onClick={() => handleGenerateStatue()}
            >
              {generatingId ? (
                <><Loader2 className="h-3 w-3 animate-spin" />Teším sochu...</>
              ) : (
                <><ImageIcon className="h-3 w-3" />{p.portrait_url ? "Nová socha" : "Odhalit sochu"}</>
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-[10px] h-7 gap-1"
              disabled={writingId}
              onClick={handleWriteBasicToChroWiki}
            >
              {writingId ? (
                <><Loader2 className="h-3 w-3 animate-spin" />Zapisuji...</>
              ) : (
                <><BookOpen className="h-3 w-3" />Základní zápis</>
              )}
            </Button>
          </div>

          {/* Admin tools */}
          {isAdmin && (
            <div className="mt-1.5 pt-1.5 border-t border-border/30">
              <div className="flex gap-2 items-center flex-wrap">
                <Badge variant="outline" className="text-[8px] text-muted-foreground border-primary/20">⚙ Admin</Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-[9px] h-6 gap-1 text-muted-foreground"
                  onClick={() => setEditingPrompt(!editingPrompt)}
                >
                  <Pencil className="h-3 w-3" />
                  {editingPrompt ? "Zrušit" : "Re-prompt obraz"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-[9px] h-6 gap-1 text-muted-foreground"
                  disabled={generatingText}
                  onClick={handleGenerateRichText}
                >
                  <RefreshCw className="h-3 w-3" />
                  Přegenerovat text
                </Button>
              </div>
              {editingPrompt && (
                <div className="mt-2 space-y-1.5">
                  <Textarea
                    value={customPrompt}
                    onChange={e => setCustomPrompt(e.target.value)}
                    placeholder="Upřesněte jak má socha/portrét vypadat... Např: 'Zobrazen s mečem v ruce, na pozadí hořící aréna'"
                    rows={2}
                    className="text-[11px]"
                  />
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="default"
                      className="text-[10px] h-6 gap-1"
                      disabled={generatingId || !customPrompt.trim()}
                      onClick={() => handleGenerateStatue(customPrompt)}
                    >
                      {generatingId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      Generovat s promptem
                    </Button>
                    <Button size="sm" variant="ghost" className="text-[10px] h-6" onClick={() => { setEditingPrompt(false); setCustomPrompt(""); }}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
