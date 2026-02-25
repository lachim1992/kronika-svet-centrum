import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { dispatchCommand } from "@/lib/commands";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FileText, Upload, Loader2, Check, Scroll, BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import EventExtractorReview, { type DetectedEvent } from "./EventExtractorReview";

interface SourceImportPanelProps {
  sessionId: string;
  currentPlayerName: string;
  onRefetch?: () => void;
}

const SourceImportPanel = ({ sessionId, currentPlayerName, onRefetch }: SourceImportPanelProps) => {
  const [title, setTitle] = useState("");
  const [rawText, setRawText] = useState("");
  const [step, setStep] = useState<"input" | "extracting" | "review" | "done">("input");
  const [detectedEvents, setDetectedEvents] = useState<DetectedEvent[]>([]);
  const [sourceId, setSourceId] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!rawText.trim()) {
      toast.error("Vložte text k analýze");
      return;
    }

    setStep("extracting");

    // Save the source
    const { data: source, error: srcErr } = await supabase.from("import_sources").insert({
      session_id: sessionId,
      source_type: "text",
      title: title || "Import " + new Date().toLocaleDateString("cs-CZ"),
      raw_text: rawText,
      status: "processing",
    } as any).select("id").single();

    if (srcErr) {
      console.error(srcErr);
      toast.error("Nepodařilo se uložit zdroj");
      setStep("input");
      return;
    }
    setSourceId(source.id);

    // Run extraction
    try {
      const { data, error } = await supabase.functions.invoke("extract-events", {
        body: { text: rawText, sessionId },
      });
      if (error) throw error;

      if (data?.detectedEvents?.length > 0) {
        setDetectedEvents(data.detectedEvents);
        setStep("review");
      } else {
        toast.info("V textu nebyly nalezeny žádné události");
        await supabase.from("import_sources").update({
          status: "completed", parsed_events_count: 0,
        } as any).eq("id", source.id);
        setStep("done");
      }
    } catch (e) {
      console.error("Extraction error:", e);
      toast.error("Chyba při analýze textu");
      setStep("input");
    }
  };

  const handleConfirm = async (references: any[], updatedText: string) => {
    // Create chronicle entry via command-dispatch
    const result = await dispatchCommand({
      sessionId,
      actor: { name: currentPlayerName, type: "player" },
      commandType: "IMPORT_SOURCE",
      commandPayload: {
        chronicleText: updatedText,
        references,
      },
    });

    if (!result.ok) {
      console.error(result.error);
      toast.error("Nepodařilo se vytvořit záznam v kronice");
    } else {
      toast.success("Import dokončen — vytvořen záznam v kronice");
    }

    // Update source status
    if (sourceId) {
      await supabase.from("import_sources").update({
        status: "completed",
        parsed_events_count: references.filter(r => r.type === "event").length,
        parsed_chronicles_count: 1,
      } as any).eq("id", sourceId);
    }

    setStep("done");
    onRefetch?.();
  };

  const handleCancel = () => {
    setDetectedEvents([]);
    setStep("input");
  };

  const handleReset = () => {
    setTitle("");
    setRawText("");
    setDetectedEvents([]);
    setSourceId(null);
    setStep("input");
  };

  if (step === "done") {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center space-y-3">
          <Check className="h-10 w-10 text-primary mx-auto" />
          <p className="font-semibold">Import dokončen!</p>
          <p className="text-sm text-muted-foreground">
            Text byl analyzován a propojení vytvořena.
          </p>
          <Button variant="outline" onClick={handleReset}>
            Importovat další
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (step === "extracting") {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-3">
          <Loader2 className="h-8 w-8 text-primary mx-auto animate-spin" />
          <p className="font-semibold">Analyzuji text...</p>
          <p className="text-sm text-muted-foreground">
            AI hledá zmínky o bitvách, korunovacích, morech a dalších událostech.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (step === "review") {
    return (
      <div className="space-y-3">
        <Card className="bg-muted/20">
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground mb-1">Importovaný text:</p>
            <ScrollArea className="max-h-32">
              <p className="text-sm whitespace-pre-wrap">{rawText.slice(0, 500)}{rawText.length > 500 ? "..." : ""}</p>
            </ScrollArea>
          </CardContent>
        </Card>
        <EventExtractorReview
          sessionId={sessionId}
          detectedEvents={detectedEvents}
          sourceText={rawText}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Vložte herní log, poznámky nebo popis událostí. AI automaticky detekuje zmínky a navrhne propojení s historií světa.
      </p>

      <Input
        placeholder="Název zdroje (volitelné)"
        value={title}
        onChange={e => setTitle(e.target.value)}
      />

      <Textarea
        placeholder="Vložte text herního logu, poznámek nebo popisu událostí...&#10;&#10;Např: 'V 3. kole Rakuské Impérium napadlo Frakuskou Federaci u města Brno. Bitva skončila remízou a obě strany utrpěly těžké ztráty...'"
        value={rawText}
        onChange={e => setRawText(e.target.value)}
        rows={8}
        className="font-mono text-sm"
      />

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {rawText.length} znaků
        </p>
        <Button onClick={handleAnalyze} disabled={!rawText.trim()}>
          <FileText className="h-4 w-4 mr-1.5" />
          Analyzovat a importovat
        </Button>
      </div>
    </div>
  );
};

export default SourceImportPanel;
