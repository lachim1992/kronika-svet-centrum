import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { History, Loader2, Pencil, RefreshCw, Save, Sparkles, X, ImageIcon, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

interface AdminWikiToolsProps {
  sessionId: string;
  entityType: string;
  entityId: string;
  entityName: string;
  wikiEntryId?: string;
  currentDescription?: string | null;
  currentImageUrl?: string | null;
  currentImagePrompt?: string | null;
  currentPlayerName: string;
  onRefresh: () => Promise<void>;
}

interface VersionEntry {
  id: string;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  old_image_url: string | null;
  new_image_url: string | null;
  image_custom_prompt: string | null;
  changed_by: string;
  change_reason: string | null;
  created_at: string;
}

export default function AdminWikiTools({
  sessionId, entityType, entityId, entityName, wikiEntryId,
  currentDescription, currentImageUrl, currentImagePrompt,
  currentPlayerName, onRefresh,
}: AdminWikiToolsProps) {
  const [expanded, setExpanded] = useState(false);
  const [regeneratingText, setRegeneratingText] = useState(false);
  const [regeneratingImage, setRegeneratingImage] = useState(false);
  const [editingImagePrompt, setEditingImagePrompt] = useState(false);
  const [customImagePrompt, setCustomImagePrompt] = useState("");
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [loadingVersions, setLoadingVersions] = useState(false);

  const loadVersions = useCallback(async () => {
    if (!wikiEntryId) return;
    setLoadingVersions(true);
    const { data } = await supabase
      .from("wiki_entry_versions" as any)
      .select("*")
      .eq("wiki_entry_id", wikiEntryId)
      .order("created_at", { ascending: false })
      .limit(20);
    setVersions((data || []) as unknown as VersionEntry[]);
    setLoadingVersions(false);
  }, [wikiEntryId]);

  const handleRegenerateText = async () => {
    setRegeneratingText(true);
    try {
      const { data, error } = await supabase.functions.invoke("wiki-generate", {
        body: { entityType, entityName, entityId, sessionId, ownerPlayer: currentPlayerName, context: {} },
      });
      if (error) throw error;
      if (data?.aiDescription && wikiEntryId) {
        // Save version
        await supabase.from("wiki_entry_versions" as any).insert({
          wiki_entry_id: wikiEntryId,
          session_id: sessionId,
          field_changed: "ai_description",
          old_value: currentDescription || null,
          new_value: data.aiDescription,
          changed_by: currentPlayerName,
          change_reason: "Admin regenerate",
        });
        await supabase.from("wiki_entries").update({
          summary: data.summary,
          ai_description: data.aiDescription,
          image_prompt: data.imagePrompt,
          updated_at: new Date().toISOString(),
        }).eq("id", wikiEntryId);
        await onRefresh();
        toast.success("📜 Text přegenerován a verze uložena!");
      }
    } catch (e) {
      console.error(e);
      toast.error("Regenerace textu selhala");
    }
    setRegeneratingText(false);
  };

  const handleRegenerateImage = async (extraPrompt?: string) => {
    setRegeneratingImage(true);
    try {
      const prompt = extraPrompt
        ? `${currentImagePrompt || `Illustration of ${entityName}`}. Additional: ${extraPrompt}`
        : currentImagePrompt || `Illustration of ${entityName}, fantasy style`;
      
      const { data, error } = await supabase.functions.invoke("encyclopedia-image", {
        body: {
          entityType, entityName, entityId, sessionId,
          imagePrompt: prompt,
          createdBy: currentPlayerName,
          description: currentDescription?.substring(0, 200) || entityName,
        },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }

      if (data?.imageUrl && wikiEntryId) {
        // Save version
        await supabase.from("wiki_entry_versions" as any).insert({
          wiki_entry_id: wikiEntryId,
          session_id: sessionId,
          field_changed: "image",
          old_image_url: currentImageUrl || null,
          new_image_url: data.imageUrl,
          image_custom_prompt: extraPrompt || null,
          changed_by: currentPlayerName,
          change_reason: extraPrompt ? "Admin custom re-prompt" : "Admin image regenerate",
        });

        await supabase.from("wiki_entries").update({
          image_url: data.imageUrl,
          updated_at: new Date().toISOString(),
        }).eq("id", wikiEntryId);
        await onRefresh();
        toast.success("🖼️ Obraz přegenerován!");
      }
      setEditingImagePrompt(false);
      setCustomImagePrompt("");
    } catch (e) {
      console.error(e);
      toast.error("Regenerace obrazu selhala");
    }
    setRegeneratingImage(false);
  };

  const handleRestoreVersion = async (v: VersionEntry) => {
    try {
      if (v.field_changed === "ai_description" && v.old_value && wikiEntryId) {
        await supabase.from("wiki_entries").update({ ai_description: v.old_value } as any).eq("id", wikiEntryId);
        // Log the restore as a new version
        await supabase.from("wiki_entry_versions" as any).insert({
          wiki_entry_id: wikiEntryId,
          session_id: sessionId,
          field_changed: "ai_description",
          old_value: currentDescription,
          new_value: v.old_value,
          changed_by: currentPlayerName,
          change_reason: `Restored from version ${new Date(v.created_at).toLocaleDateString("cs")}`,
        });
        await onRefresh();
        toast.success("Text obnoven z předchozí verze!");
      } else if (v.field_changed === "image" && v.old_image_url && wikiEntryId) {
        await supabase.from("wiki_entries").update({ image_url: v.old_image_url } as any).eq("id", wikiEntryId);
        await supabase.from("wiki_entry_versions" as any).insert({
          wiki_entry_id: wikiEntryId,
          session_id: sessionId,
          field_changed: "image",
          old_image_url: currentImageUrl,
          new_image_url: v.old_image_url,
          changed_by: currentPlayerName,
          change_reason: `Restored image from ${new Date(v.created_at).toLocaleDateString("cs")}`,
        });
        await onRefresh();
        toast.success("Obraz obnoven z předchozí verze!");
      }
    } catch (e) {
      toast.error("Obnovení selhalo");
    }
  };

  if (!wikiEntryId) return null;

  return (
    <div className="mt-3 p-3 rounded-lg" style={{ background: 'hsl(var(--secondary) / 0.15)', border: '1px solid hsl(var(--primary) / 0.15)' }}>
      <button
        className="flex items-center gap-2 w-full text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <Badge variant="outline" className="text-[9px] border-primary/30">⚙ Admin nástroje</Badge>
        <span className="text-[10px] text-muted-foreground flex-1">Regenerace, re-prompt, historie verzí</span>
        {expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="mt-3 space-y-2.5">
          {/* Text regenerate */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm" variant="outline"
              className="text-[10px] h-7 gap-1"
              disabled={regeneratingText}
              onClick={handleRegenerateText}
            >
              {regeneratingText ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Přegenerovat text
            </Button>
            <Button
              size="sm" variant="outline"
              className="text-[10px] h-7 gap-1"
              disabled={regeneratingImage}
              onClick={() => handleRegenerateImage()}
            >
              {regeneratingImage ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3" />}
              Přegenerovat obraz
            </Button>
            <Button
              size="sm" variant="ghost"
              className="text-[10px] h-7 gap-1"
              onClick={() => setEditingImagePrompt(!editingImagePrompt)}
            >
              <Pencil className="h-3 w-3" />
              {editingImagePrompt ? "Zrušit" : "Re-prompt obraz"}
            </Button>
            <Button
              size="sm" variant="ghost"
              className="text-[10px] h-7 gap-1"
              onClick={() => { setVersionsOpen(true); loadVersions(); }}
            >
              <History className="h-3 w-3" />
              Historie verzí
            </Button>
          </div>

          {/* Custom image prompt */}
          {editingImagePrompt && (
            <div className="space-y-1.5">
              <Textarea
                value={customImagePrompt}
                onChange={e => setCustomImagePrompt(e.target.value)}
                placeholder="Upřesněte jak má obraz vypadat... Např: 'Zobrazen na trůnu, s korunou a mečem'"
                rows={2}
                className="text-[11px]"
              />
              <div className="flex gap-1.5">
                <Button
                  size="sm" variant="default"
                  className="text-[10px] h-6 gap-1"
                  disabled={regeneratingImage || !customImagePrompt.trim()}
                  onClick={() => handleRegenerateImage(customImagePrompt)}
                >
                  {regeneratingImage ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  Generovat s promptem
                </Button>
                <Button size="sm" variant="ghost" className="text-[10px] h-6" onClick={() => { setEditingImagePrompt(false); setCustomImagePrompt(""); }}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}

          {/* Current image prompt info */}
          {currentImagePrompt && (
            <p className="text-[9px] text-muted-foreground/60 italic truncate">
              Aktuální prompt: {currentImagePrompt.substring(0, 100)}…
            </p>
          )}
        </div>
      )}

      {/* Version history dialog */}
      <Dialog open={versionsOpen} onOpenChange={setVersionsOpen}>
        <DialogContent className="max-w-lg max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="font-display text-base">Historie verzí — {entityName}</DialogTitle>
          </DialogHeader>
          {loadingVersions ? (
            <div className="text-center py-8">
              <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : versions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Žádné záznamy verzí.</p>
          ) : (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-3">
                {versions.map(v => (
                  <div key={v.id} className="p-3 rounded-lg border border-border/50 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={v.field_changed === "image" ? "secondary" : "outline"} className="text-[9px]">
                        {v.field_changed === "image" ? "🖼️ Obraz" : "📝 Text"}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">{v.changed_by}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {new Date(v.created_at).toLocaleString("cs")}
                      </span>
                    </div>
                    {v.change_reason && (
                      <p className="text-[10px] text-muted-foreground/70 italic">{v.change_reason}</p>
                    )}
                    {v.field_changed === "image" && (
                      <div className="flex gap-2">
                        {v.old_image_url && (
                          <div className="space-y-1">
                            <span className="text-[9px] text-muted-foreground">Předchozí:</span>
                            <img src={v.old_image_url} alt="old" className="w-16 h-16 object-cover rounded border border-border" />
                          </div>
                        )}
                        {v.new_image_url && (
                          <div className="space-y-1">
                            <span className="text-[9px] text-muted-foreground">Nový:</span>
                            <img src={v.new_image_url} alt="new" className="w-16 h-16 object-cover rounded border border-border" />
                          </div>
                        )}
                      </div>
                    )}
                    {v.image_custom_prompt && (
                      <p className="text-[9px] text-muted-foreground/60">Prompt: {v.image_custom_prompt}</p>
                    )}
                    {v.field_changed === "ai_description" && v.old_value && (
                      <details className="text-[10px]">
                        <summary className="cursor-pointer text-muted-foreground">Předchozí text</summary>
                        <p className="mt-1 text-muted-foreground/70 whitespace-pre-wrap line-clamp-5">{v.old_value}</p>
                      </details>
                    )}
                    {v.old_value || v.old_image_url ? (
                      <Button
                        size="sm" variant="ghost"
                        className="text-[9px] h-5 gap-1 text-primary/70"
                        onClick={() => handleRestoreVersion(v)}
                      >
                        <History className="h-3 w-3" /> Obnovit tuto verzi
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
