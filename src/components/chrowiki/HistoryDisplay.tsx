import { Badge } from "@/components/ui/badge";
import { Calendar, BookOpen, Users, Tag, AlertTriangle, BarChart3 } from "lucide-react";

export interface HistoryResult {
  timeline: Array<{ turn: number; title: string; summary: string; eventId: string }>;
  synthesis: string;
  keyFacts: string[];
  actors: Array<{ name: string; role: string; period?: string }>;
  themes: string[];
  insufficient: boolean;
}

interface Props {
  result: HistoryResult;
  onEventClick: (eventId: string, title: string) => void;
}

/** Parse [[event:UUID|Label]] into clickable spans */
function renderWithRefs(text: string, onEventClick: (id: string, title: string) => void) {
  const parts: (string | JSX.Element)[] = [];
  const regex = /\[\[event:([a-f0-9-]+)\|([^\]]+)\]\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
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
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

const HistoryDisplay = ({ result, onEventClick }: Props) => {
  return (
    <div className="space-y-5">
      {result.insufficient && (
        <div className="p-3 rounded-lg text-center"
          style={{ background: 'hsl(var(--destructive) / 0.08)', border: '1px solid hsl(var(--destructive) / 0.25)' }}
        >
          <AlertTriangle className="h-4 w-4 text-destructive mx-auto mb-1" />
          <p className="text-xs text-destructive font-display font-semibold">Nedostatek zdrojů — syntéza může být neúplná</p>
        </div>
      )}

      {/* Themes */}
      {result.themes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
          {result.themes.map((t, i) => (
            <Badge key={i} variant="outline" className="text-[10px]">{t}</Badge>
          ))}
        </div>
      )}

      {/* Timeline */}
      {result.timeline.length > 0 && (
        <section>
          <h4 className="font-decorative text-sm font-semibold mb-2 flex items-center gap-2 text-foreground">
            <Calendar className="h-3.5 w-3.5 text-primary" /> Chronologie
          </h4>
          <div className="space-y-1.5 pl-2" style={{ borderLeft: '2px solid hsl(var(--primary) / 0.2)' }}>
            {result.timeline.map((t, i) => (
              <div key={i}
                className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-secondary/30 cursor-pointer transition-colors text-sm"
                onClick={() => onEventClick(t.eventId, t.title)}
              >
                <Badge variant="secondary" className="text-[9px] shrink-0 mt-0.5">K{t.turn}</Badge>
                <div className="min-w-0">
                  <span className="font-display font-semibold text-foreground">{t.title}</span>
                  {t.summary && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.summary}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Synthesis */}
      <section>
        <h4 className="font-decorative text-sm font-semibold mb-2 flex items-center gap-2 text-foreground">
          <BookOpen className="h-3.5 w-3.5 text-primary" /> Historická syntéza
        </h4>
        <div className="text-[15px] leading-[1.75] text-foreground/90 font-body whitespace-pre-wrap">
          {renderWithRefs(result.synthesis, onEventClick)}
        </div>
      </section>

      {/* Key Facts */}
      {result.keyFacts.length > 0 && (
        <section>
          <h4 className="font-decorative text-sm font-semibold mb-2 flex items-center gap-2 text-foreground">
            <BarChart3 className="h-3.5 w-3.5 text-primary" /> Klíčová fakta
          </h4>
          <ul className="space-y-1 pl-4">
            {result.keyFacts.map((f, i) => (
              <li key={i} className="text-sm font-body text-foreground/85 leading-relaxed list-disc marker:text-primary/50">
                {renderWithRefs(f, onEventClick)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Actors */}
      {result.actors.length > 0 && (
        <section>
          <h4 className="font-decorative text-sm font-semibold mb-2 flex items-center gap-2 text-foreground">
            <Users className="h-3.5 w-3.5 text-primary" /> Klíčoví aktéři
          </h4>
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid hsl(var(--border))' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'hsl(var(--secondary) / 0.4)' }}>
                  <th className="text-left p-2 font-display text-foreground">Jméno</th>
                  <th className="text-left p-2 font-display text-foreground">Role</th>
                  <th className="text-left p-2 font-display text-foreground">Období</th>
                </tr>
              </thead>
              <tbody>
                {result.actors.map((a, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                    <td className="p-2 font-display font-semibold text-foreground">{a.name}</td>
                    <td className="p-2 text-muted-foreground">{a.role}</td>
                    <td className="p-2 text-muted-foreground">{a.period || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};

export default HistoryDisplay;
