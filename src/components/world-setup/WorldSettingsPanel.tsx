import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import type { WorldGameSettings } from "@/lib/worldGameSettings";

interface Props {
  value: WorldGameSettings;
  onChange: (v: WorldGameSettings) => void;
  /** Opponent count lives in the world spec; shown here for convenience. */
  opponents?: number;
  onOpponentsChange?: (n: number) => void;
  disabled?: boolean;
  /** River defaults inferred from the analysed premise. */
  premiseDefaults?: Pick<WorldGameSettings, "riverAmount" | "riverLength">;
}

const LEVEL = [
  { v: "low", l: "Málo" },
  { v: "normal", l: "Normálně" },
  { v: "high", l: "Hodně" },
];

function Choice({ label, hint, value, options, onChange, disabled }: {
  label: string; hint?: string; value: string; options: { v: string; l: string }[];
  onChange: (v: string) => void; disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.v} value={o.v} className="text-xs">{o.l}</SelectItem>)}
        </SelectContent>
      </Select>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export const WorldSettingsPanel = ({ value, onChange, opponents, onOpponentsChange, disabled, premiseDefaults }: Props) => {
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<WorldGameSettings>) => onChange({ ...value, ...patch });
  const LBL: Record<string, string> = { low: "málo", normal: "normálně", high: "hodně" };
  const LEN: Record<string, string> = { low: "krátké", normal: "normální", high: "dlouhé" };
  const auto = (d?: string, map = LBL) => ({ v: "auto", l: d ? `Podle premisy (${map[d]})` : "Podle premisy (po analýze)" });

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">⚙️ Nastavení světa</h3>
      <p className="text-[11px] text-muted-foreground">Co nenastavíš, odvodí se z premisy světa.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {onOpponentsChange && (
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">AI protivníci: <b>{opponents ?? 0}</b></Label>
            <Slider min={0} max={7} step={1} value={[opponents ?? 0]} disabled={disabled}
              onValueChange={(v) => onOpponentsChange(v[0])} />
          </div>
        )}
        <Choice label="Obtížnost AI" disabled={disabled} value={value.aiDifficulty ?? "normal"}
          hint="Mění startovní zásoby AI a jejich výchozí povahu."
          options={[{ v: "easy", l: "Lehká (mírumilovní)" }, { v: "normal", l: "Normální" }, { v: "hard", l: "Těžká (agresivní)" }]}
          onChange={(v) => set({ aiDifficulty: v as WorldGameSettings["aiDifficulty"] })} />
        <Choice label="Startovní města na říši" disabled={disabled} value={String(value.startingCities ?? 1)}
          options={[{ v: "1", l: "1 město" }, { v: "2", l: "2 města" }, { v: "3", l: "3 města" }]}
          onChange={(v) => set({ startingCities: Number(v) })} />
        <Choice label="Startovní zlato a obilí" disabled={disabled} value={value.startingWealth ?? "normal"}
          options={[{ v: "low", l: "Chudý start (50 zlata)" }, { v: "normal", l: "Normální (100 zlata)" }, { v: "high", l: "Bohatý start (250 zlata)" }]}
          onChange={(v) => set({ startingWealth: v as WorldGameSettings["startingWealth"] })} />
      </div>

      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger disabled={disabled}
          className="flex items-center gap-2 w-full p-2 rounded-md border border-border bg-muted/30 hover:bg-muted text-xs font-medium disabled:opacity-50">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">Rozšířené nastavení (řeky, neutrální města, vzdálenost)</span>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Choice label="Množství řek" disabled={disabled} value={value.riverAmount ?? "auto"} options={[auto(premiseDefaults?.riverAmount), ...LEVEL]}
            hint="Vlhký svět s lesy má víc řek, poušť méně. Řeky tečou z hor k moři."
            onChange={(v) => set({ riverAmount: v === "auto" ? undefined : v as WorldGameSettings["riverAmount"] })} />
          <Choice label="Délka a význam řek" disabled={disabled} value={value.riverLength ?? "auto"}
            options={[auto(premiseDefaults?.riverLength, LEN), { v: "low", l: "Krátké potoky" }, { v: "normal", l: "Normální řeky" }, { v: "high", l: "Dlouhé veletoky" }]}
            onChange={(v) => set({ riverLength: v === "auto" ? undefined : v as WorldGameSettings["riverLength"] })} />
          <Choice label="Neutrální města" disabled={disabled} value={value.neutralTowns ?? "normal"}
            options={[{ v: "none", l: "Žádná" }, ...LEVEL]}
            onChange={(v) => set({ neutralTowns: v as WorldGameSettings["neutralTowns"] })} />
          <Choice label="Vzdálenost mezi říšemi" disabled={disabled} value={value.realmDistance ?? "normal"}
            options={[{ v: "low", l: "Blízko" }, { v: "normal", l: "Normálně" }, { v: "high", l: "Daleko" }]}
            onChange={(v) => set({ realmDistance: v as WorldGameSettings["realmDistance"] })} />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};
