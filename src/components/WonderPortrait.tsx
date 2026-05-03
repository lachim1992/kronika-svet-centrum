import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ImageIcon, Sparkles, Check, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { addGameEvent } from "@/hooks/useGameSession";

interface WonderPortraitProps {
  wonderId: string;
  wonderName: string;
  cityName: string | null;
  imageUrl: string | null;
  imagePrompt: string | null;
  ownerPlayer: string;
  currentPlayerName: string;
  sessionId: string;
  currentTurn: number;
  onRefetch?: () => void;
}

interface DraftImage {
  id: string;
  image_url: string;
  image_prompt: string | null;
  created_at: string;
  is_primary: boolean;
}

const WonderPortrait = ({
  wonderId, wonderName, cityName, imageUrl, imagePrompt,
  ownerPlayer, currentPlayerName, sessionId, currentTurn, onRefetch,
}: WonderPortraitProps) => {
  const isOwner = ownerPlayer === currentPlayerName;
  const [promptText, setPromptText] = useState(imagePrompt || "");
  const [generating, setGenerating] = useState(false);
  const [drafts, setDrafts] = useState<DraftImage[]>([]);
  const [showEditor, setShowEditor] = useState(false);

  useEffect(() => {
    fetchDrafts();
  }, [wonderId]);

  const fetchDrafts = async () => {
    const { data } = await supabase
      .from("encyclopedia_images")
      .select("*")
      .eq("session_id", sessionId)
      .eq("entity_type", "wonder")
      .eq("entity_id", wonderId)
      .eq("is_primary", false)
      .order("created_at", { ascending: false });
    if (data) setDrafts(data as DraftImage[]);
  };

  const handleGenerate = async () => {
    if (!promptText.trim()) {
      toast.error("Zadejte popis portrétu divu");
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-entity-media", {
        body: {
          sessionId,
          entityId: wonderId,
          entityType: "wonder",
          entityName: wonderName,
          kind: "illustration",
          imagePrompt: promptText,
          createdBy: currentPlayerName,
        },
      });

      if (error) throw error;
      if (data.error) { toast.error(data.error); return; }

      await supabase.from("wonders").update({
        image_prompt: promptText,
        updated_at: new Date().toISOString(),
      }).eq("id", wonderId);

      await fetchDrafts();
      toast.success(`🎨 Kandidát portrétu vygenerován!`);
      onRefetch?.();
    } catch (e) {
      console.error(e);
      toast.error("Generování portrétu selhalo");
    }
    setGenerating(false);
  };

  const handleApprove = async (draft: DraftImage) => {
    // P3: canonical-replace promote. Update existing cover row in place (unique index
    // encyclopedia_images_one_cover allows ≤1 cover per entity). Draft row stays as
    // 'illustration' (append-only history preserved).
    const coverPayload = {
      image_url: draft.image_url,
      image_prompt: draft.image_prompt || promptText,
      is_primary: true,
      kind: "cover",
      style_preset: "default",
      created_by: currentPlayerName,
    } as any;

    const { data: existingCover } = await supabase
      .from("encyclopedia_images")
      .select("id, image_version")
      .eq("session_id", sessionId)
      .eq("entity_type", "wonder")
      .eq("entity_id", wonderId)
      .eq("kind", "cover")
      .maybeSingle();

    if (existingCover) {
      await supabase.from("encyclopedia_images")
        .update({ ...coverPayload, image_version: ((existingCover as any).image_version ?? 1) + 1 })
        .eq("id", (existingCover as any).id);
    } else {
      await supabase.from("encyclopedia_images").insert({
        session_id: sessionId,
        entity_type: "wonder",
        entity_id: wonderId,
        image_version: 1,
        ...coverPayload,
      } as any);
    }

    // Mirror to legacy tables for backward compat.
    await supabase.from("wonders").update({
      image_url: draft.image_url,
      image_prompt: draft.image_prompt || promptText,
      updated_at: new Date().toISOString(),
    }).eq("id", wonderId);

    await supabase.from("wiki_entries").update({
      image_url: draft.image_url,
      image_prompt: draft.image_prompt || promptText,
      updated_at: new Date().toISOString(),
    }).eq("session_id", sessionId).eq("entity_type", "wonder").eq("entity_id", wonderId);

    await addGameEvent(
      sessionId, "wonder", ownerPlayer, cityName || "",
      `Portrét divu „${wonderName}" byl zapsán do dějin${cityName ? ` ${cityName}` : ""}.`,
      currentTurn
    );

    await fetchDrafts();
    toast.success(`✅ Oficiální portrét „${wonderName}" potvrzen!`);
    onRefetch?.();
  };

  // View-only mode for non-owners
  if (!isOwner) {
    return (
      <div className="space-y-2">
        {imageUrl ? (
          <img src={imageUrl} alt={wonderName} className="w-full h-48 object-cover rounded-md" />
        ) : (
          <div className="h-32 bg-muted/50 flex items-center justify-center rounded-md">
            <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Current official portrait */}
      {imageUrl ? (
        <img src={imageUrl} alt={wonderName} className="w-full h-48 object-cover rounded-md" />
      ) : (
        <div className="h-32 bg-muted/50 flex items-center justify-center rounded-md border border-dashed border-border">
          <div className="text-center text-muted-foreground">
            <ImageIcon className="h-8 w-8 mx-auto mb-1 opacity-30" />
            <p className="text-xs">Žádný oficiální portrét</p>
          </div>
        </div>
      )}

      {/* Owner controls */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={showEditor ? "default" : "outline"}
          onClick={() => setShowEditor(!showEditor)}
          className="text-xs font-display"
        >
          <Sparkles className="h-3 w-3 mr-1" />
          {imageUrl ? "Regenerovat portrét" : "Vygenerovat portrét"}
        </Button>
      </div>

      {/* Prompt editor */}
      {showEditor && (
        <div className="space-y-2 p-3 bg-muted/30 rounded-md border border-border">
          <label className="text-xs font-display font-semibold text-muted-foreground">
            🎨 Popis portrétu (česky)
          </label>
          <Textarea
            placeholder="Popište, jak by div měl vypadat, např.: Růžový mramorový chrám při západu slunce, epická atmosféra..."
            value={promptText}
            onChange={e => setPromptText(e.target.value)}
            rows={2}
            className="text-sm"
          />
          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={generating}
            className="w-full font-display"
          >
            {generating ? (
              <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Tvořím portrét...</>
            ) : (
              <><Sparkles className="h-3 w-3 mr-1" />Vygenerovat kandidáta</>
            )}
          </Button>
        </div>
      )}

      {/* Draft candidates gallery */}
      {drafts.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-display font-semibold flex items-center gap-1">
            <RefreshCw className="h-3 w-3" />
            Kandidáti ({drafts.length})
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {drafts.map(draft => (
              <div key={draft.id} className="relative group rounded-md overflow-hidden border border-border">
                <img
                  src={draft.image_url}
                  alt="Kandidát"
                  className="w-full h-32 object-cover"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button
                    size="sm"
                    onClick={() => handleApprove(draft)}
                    className="text-xs font-display"
                  >
                    <Check className="h-3 w-3 mr-1" />
                    Potvrdit
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground italic text-center">
            Najeďte na obrázek a klikněte „Potvrdit" pro oficiální portrét
          </p>
        </div>
      )}
    </div>
  );
};

export default WonderPortrait;
