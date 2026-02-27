import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Crown, Shield, Sparkles, BookOpen, Flame } from "lucide-react";

interface SagaResult {
  chronology: string[];
  founding_myth_echo?: string;
  saga: string;
  actors: Array<{ name: string; role: string; linkedItems?: string[] }>;
  consequences: string;
  legends?: string;
  isProtoSaga: boolean;
}

interface Props {
  result: SagaResult;
  onEventClick: (eventId: string, title: string) => void;
}

/** Parse [[event:UUID|Label]] into clickable spans */
function renderWithRefs(text: string, onEventClick: (id: string, title: string) => void) {
  const parts: (string | JSX.Element)[] = [];
  const regex = /\[\[event:([a-f0-9-]+)\|([^\]]+)\]\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const eventId = match[1];
    const label = match[2];
    parts.push(
      <span
        key={`${eventId}-${match.index}`}
        className="text-primary underline underline-offset-2 decoration-primary/40 cursor-pointer hover:decoration-primary transition-colors font-display"
        onClick={(e) => { e.stopPropagation(); onEventClick(eventId, label); }}
        title={`Událost: ${label}`}
      >
        {label}
      </span>
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

const SagaDisplay = ({ result, onEventClick }: Props) => {
  return (
    <div className="space-y-5">
      {result.isProtoSaga && (
        <div className="p-3 rounded-lg text-center"
          style={{ background: 'hsl(var(--destructive) / 0.08)', border: '1px solid hsl(var(--destructive) / 0.25)' }}
        >
          <p className="text-xs text-destructive font-display font-semibold">⚠ Proto-sága — spekulativní verze s omezenými zdroji</p>
        </div>
      )}

      {/* A) Chronology */}
      <section>
        <h4 className="font-decorative text-sm font-semibold mb-2 flex items-center gap-2 text-foreground">
          <BookOpen className="h-3.5 w-3.5 text-primary" /> Stručná chronologie
        </h4>
        <ul className="space-y-1.5 pl-4">
          {result.chronology.map((item, i) => (
            <li key={i} className="text-sm font-body text-foreground/85 leading-relaxed list-disc marker:text-primary/50">
              {renderWithRefs(item, onEventClick)}
            </li>
          ))}
        </ul>
      </section>

      {/* B) Founding Myth Echo */}
      {result.founding_myth_echo && result.founding_myth_echo.trim().length > 10 && (
        <section>
          <h4 className="font-decorative text-sm font-semibold mb-2 flex items-center gap-2 text-foreground">
            <Flame className="h-3.5 w-3.5 text-primary" /> Zakladatelský mýtus
          </h4>
          <div className="text-[15px] leading-[1.85] text-foreground/90 font-body whitespace-pre-wrap p-4 rounded-lg italic"
            style={{ background: 'hsl(var(--primary) / 0.04)', borderLeft: '4px solid hsl(var(--primary) / 0.4)' }}
          >
            {renderWithRefs(result.founding_myth_echo, onEventClick)}
          </div>
        </section>
      )}

      {/* C) Main Saga */}
      <section>
        <h4 className="font-decorative text-sm font-semibold mb-2 flex items-center gap-2 text-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> Sága místa
        </h4>
        <div className="prose-chronicle drop-cap-section text-[15px] leading-[1.75] text-foreground/90 font-body whitespace-pre-wrap">
          {renderWithRefs(result.saga, onEventClick)}
        </div>
      </section>

      {/* C) Actors table */}
      {result.actors.length > 0 && (
        <section>
          <h4 className="font-decorative text-sm font-semibold mb-2 flex items-center gap-2 text-foreground">
            <Crown className="h-3.5 w-3.5 text-primary" /> Klíčové postavy a frakce
          </h4>
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid hsl(var(--border))' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'hsl(var(--secondary) / 0.4)' }}>
                  <th className="text-left p-2 font-display text-foreground">Jméno</th>
                  <th className="text-left p-2 font-display text-foreground">Role</th>
                  <th className="text-left p-2 font-display text-foreground">Vazby</th>
                </tr>
              </thead>
              <tbody>
                {result.actors.map((a, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                    <td className="p-2 font-display font-semibold text-foreground">{a.name}</td>
                    <td className="p-2 text-muted-foreground">{a.role}</td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-1">
                        {(a.linkedItems || []).map((item, j) => (
                          <Badge key={j} variant="outline" className="text-[8px]">{renderWithRefs(item, onEventClick)}</Badge>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* D) Consequences */}
      {result.consequences && (
        <section>
          <h4 className="font-decorative text-sm font-semibold mb-2 flex items-center gap-2 text-foreground">
            <Shield className="h-3.5 w-3.5 text-primary" /> Důsledky pro říši
          </h4>
          <div className="text-sm font-body text-foreground/85 leading-relaxed p-3 rounded-lg"
            style={{ background: 'hsl(var(--secondary) / 0.2)', borderLeft: '3px solid hsl(var(--primary) / 0.3)' }}
          >
            {renderWithRefs(result.consequences, onEventClick)}
          </div>
        </section>
      )}

      {/* E) Legends */}
      {result.legends && (
        <section>
          <h4 className="font-decorative text-sm font-semibold mb-2 flex items-center gap-2 text-muted-foreground italic">
            <Sparkles className="h-3.5 w-3.5" /> Legenda a šeptanda
          </h4>
          <div className="text-sm font-body text-muted-foreground leading-relaxed p-3 rounded-lg italic"
            style={{ background: 'hsl(var(--muted) / 0.15)', borderLeft: '3px dashed hsl(var(--muted-foreground) / 0.3)' }}
          >
            {renderWithRefs(result.legends, onEventClick)}
          </div>
        </section>
      )}
    </div>
  );
};

export default SagaDisplay;
