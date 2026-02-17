import { Badge } from "@/components/ui/badge";
import { Globe, BookOpen, Swords, Sparkles } from "lucide-react";

interface WorldFoundation {
  id: string;
  world_name: string;
  premise: string;
  tone: string;
  victory_style: string;
  initial_factions: string[];
  created_at: string;
}

interface Props {
  foundation: WorldFoundation | null;
}

const TONE_LABELS: Record<string, string> = {
  mythic: "🏛️ Mýtický",
  realistic: "📜 Realistický",
  dark_fantasy: "🌑 Dark Fantasy",
  sci_fi: "🚀 Sci-Fi",
};

const VICTORY_LABELS: Record<string, string> = {
  domination: "⚔️ Dominace",
  survival: "🛡️ Přežití",
  story: "📖 Příběh",
};

const WorldCodex = ({ foundation }: Props) => {
  if (!foundation) {
    return (
      <div className="text-center py-8 text-muted-foreground italic">
        <Globe className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p>Tento svět nemá definovaný World Codex.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="manuscript-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h3 className="font-display font-bold text-lg">{foundation.world_name}</h3>
        </div>

        <p className="text-sm leading-relaxed whitespace-pre-wrap border-l-2 border-primary/30 pl-3 italic">
          {foundation.premise}
        </p>

        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{TONE_LABELS[foundation.tone] || foundation.tone}</Badge>
          <Badge variant="outline">{VICTORY_LABELS[foundation.victory_style] || foundation.victory_style}</Badge>
        </div>

        {foundation.initial_factions.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground font-display mb-1">Počáteční frakce:</p>
            <div className="flex flex-wrap gap-1">
              {foundation.initial_factions.map((f, i) => (
                <Badge key={i} variant="outline" className="text-xs">{f}</Badge>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Založeno: {new Date(foundation.created_at).toLocaleDateString("cs-CZ")}
        </p>
      </div>
    </div>
  );
};

export default WorldCodex;
