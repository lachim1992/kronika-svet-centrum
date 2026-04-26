// AIOpponentsStep — let player name & flavor each AI opponent in SP/manual modes.
// In MP mode each player configures their own civ, so this step is hidden.

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Bot, ChevronDown, ChevronRight, Dice5 } from "lucide-react";

import type { FactionSeedInput } from "@/types/worldBootstrap";

const PERSONALITIES = [
  { value: "aggressive", label: "⚔️ Agresivní", desc: "Rád expanduje vojensky" },
  { value: "diplomatic", label: "🕊️ Diplomatický", desc: "Buduje aliance, vyjednává" },
  { value: "mercantile", label: "💰 Obchodní", desc: "Cílí na obchod a bohatství" },
  { value: "isolationist", label: "🛡️ Izolacionistický", desc: "Uzavřený, opevněný" },
  { value: "expansionist", label: "🗺️ Expanzivní", desc: "Zakládá kolonie a sídla" },
  { value: "scholarly", label: "📜 Učený", desc: "Vědění a kultura nad mečem" },
  { value: "militarist", label: "🏰 Militaristický", desc: "Velká armáda jako prestiž" },
  { value: "theocratic", label: "🔥 Teokratický", desc: "Víra řídí stát i válku" },
];

const FANTASY_NAMES = [
  "Říše Zlatého Lva", "Kmenový svaz Vraních hor", "Královstvi Stříbrných řek",
  "Bratrstvo Soumračné stráže", "Sultanát Pouštních větrů", "Konfederace Mlžných ostrovů",
  "Svaté impérium Plamene", "Severní knížectví Vlkodlaků", "Liga Karavanních měst",
  "Despotát Černé hory", "Republika Korálových břehů", "Klanové území Jeleního rohu",
];

interface Props {
  value: FactionSeedInput[];
  onChange: (next: FactionSeedInput[]) => void;
  count: number;
  disabled?: boolean;
}

const AIOpponentsStep = ({ value, onChange, count, disabled }: Props) => {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  if (count <= 0) {
    return (
      <Card className="p-3 sm:p-4 space-y-1">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">AI Protivníci</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Žádní AI protivníci — hraješ sám. Pokud chceš protivníky, zvyš počet frakcí v sekci „Detailní úpravy" níže.
        </p>
      </Card>
    );
  }

  // Ensure value has exactly `count` entries; preserve filled rows.
  const rows: FactionSeedInput[] = Array.from({ length: count }).map((_, i) => value[i] || {});

  const updateRow = (i: number, patch: Partial<FactionSeedInput>) => {
    const next = [...rows];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };

  const randomizeAll = () => {
    const used = new Set<string>();
    const next = rows.map((r, i) => {
      let name = r.name;
      if (!name || !name.trim()) {
        const pool = FANTASY_NAMES.filter((n) => !used.has(n));
        name = pool[Math.floor(Math.random() * pool.length)] || `AI Frakce ${i + 1}`;
        used.add(name);
      } else {
        used.add(name);
      }
      const personality = r.personality || PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)].value;
      return { ...r, name, personality };
    });
    onChange(next);
  };

  return (
    <Card className="p-3 sm:p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">AI Protivníci ({count})</h2>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={randomizeAll} disabled={disabled} className="h-7 text-[10px]">
          <Dice5 className="h-3 w-3 mr-1" /> Náhodně vyplnit
        </Button>
      </div>
      <p className="text-xs text-muted-foreground -mt-1">
        Pojmenuj a okoření své protivníky. Flavor se vetká do prehistorie a vystupování AI ve hře.
      </p>

      <div className="space-y-1.5">
        {rows.map((row, i) => {
          const isOpen = openIdx === i;
          const personalityLabel = PERSONALITIES.find((p) => p.value === row.personality)?.label;
          return (
            <Collapsible key={i} open={isOpen} onOpenChange={(o) => setOpenIdx(o ? i : null)}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 w-full text-left p-2 rounded border border-border hover:bg-muted/50"
                >
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  <span className="text-xs font-mono text-muted-foreground">#{i + 1}</span>
                  <span className="text-xs font-semibold flex-1 truncate">
                    {row.name?.trim() || <span className="text-muted-foreground italic">AI Frakce {i + 1}</span>}
                  </span>
                  {personalityLabel && (
                    <span className="text-[10px] text-muted-foreground hidden sm:inline">{personalityLabel}</span>
                  )}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-2 pt-2 pl-2 pb-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Jméno frakce</Label>
                      <Input
                        value={row.name || ""}
                        onChange={(e) => updateRow(i, { name: e.target.value })}
                        placeholder={`AI Frakce ${i + 1}`}
                        disabled={disabled}
                        maxLength={60}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Osobnost</Label>
                      <select
                        className="w-full h-9 px-2 rounded border border-input bg-background text-xs"
                        value={row.personality || ""}
                        onChange={(e) => updateRow(i, { personality: e.target.value })}
                        disabled={disabled}
                      >
                        <option value="">— vyber —</option>
                        {PERSONALITIES.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label} — {p.desc}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Krátký popis / flavor (volitelné)</Label>
                    <Textarea
                      value={row.description || ""}
                      onChange={(e) => updateRow(i, { description: e.target.value })}
                      placeholder="např. Mořeplavci, kteří uctívají bouři. Žijí na ostrovech, vyrábějí kořenné víno..."
                      rows={2}
                      maxLength={300}
                      disabled={disabled}
                    />
                    <p className="text-[10px] text-muted-foreground text-right">{(row.description || "").length}/300</p>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </Card>
  );
};

export default AIOpponentsStep;
