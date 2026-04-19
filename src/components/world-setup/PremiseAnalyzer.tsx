// PremiseAnalyzer — premise textarea + Analyze CTA.
// Disabled when busy (G5). Analyze button additionally requires min length.

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, AlertCircle } from "lucide-react";

export const PREMISE_MIN = 30;
export const PREMISE_MAX = 2000;

interface Props {
  premise: string;
  onPremiseChange: (v: string) => void;
  onAnalyze: () => void;
  isAnalyzing: boolean;
  isBusy: boolean;
  isSuggestionStale: boolean;
  hasSuggestion: boolean;
  analyzeError: string | null;
}

export const PremiseAnalyzer = ({
  premise,
  onPremiseChange,
  onAnalyze,
  isAnalyzing,
  isBusy,
  isSuggestionStale,
  hasSuggestion,
  analyzeError,
}: Props) => {
  const len = premise.trim().length;
  const tooShort = len < PREMISE_MIN;
  const tooLong = len > PREMISE_MAX;
  const canAnalyze = !isBusy && !tooShort && !tooLong;

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="flex justify-between items-baseline">
          <Label htmlFor="premise" className="text-sm font-medium">
            Premisa světa *
          </Label>
          <span
            className={`text-[10px] ${
              tooShort || tooLong ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {len}/{PREMISE_MIN}–{PREMISE_MAX}
          </span>
        </div>
        <Textarea
          id="premise"
          value={premise}
          onChange={(e) => onPremiseChange(e.target.value)}
          placeholder="Popište svůj svět vlastními slovy. Co je v něm jiného? Jaký konflikt definuje jeho osud? Stačí 1–3 věty."
          rows={4}
          className="resize-none"
          disabled={isBusy}
        />
        <p className="text-[10px] text-muted-foreground">
          AI z premise odvodí strukturu světa — biomy, frakce, geografii.
        </p>
      </div>

      {isSuggestionStale && hasSuggestion && (
        <div className="flex items-start gap-2 text-xs bg-warning/10 border border-warning/30 rounded-md p-2">
          <AlertCircle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
          <span className="text-foreground/90">
            Premisa byla od poslední analýzy upravena. Spusťte analýzu znovu.
          </span>
        </div>
      )}

      {analyzeError && (
        <div className="flex items-start gap-2 text-xs bg-destructive/10 border border-destructive/30 rounded-md p-2">
          <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
          <span className="text-foreground/90">{analyzeError}</span>
        </div>
      )}

      <Button
        onClick={onAnalyze}
        disabled={!canAnalyze}
        className="w-full"
        size="lg"
      >
        {isAnalyzing ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Analyzuji premisu…
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4 mr-2" />
            {hasSuggestion ? "Analyzovat znovu" : "Analyzovat premisu"}
          </>
        )}
      </Button>
    </div>
  );
};
