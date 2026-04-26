// PreWorldPremiseInput — volitelná premisa Pradávna (svět před Zlomem).
// Pokud hráč nechá prázdné, AI navrhne odvozeně z premise současnosti.

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Hourglass, Sparkles } from "lucide-react";

interface Props {
  value: string;
  suggested: boolean;
  onChange: (v: string, suggested?: boolean) => void;
  disabled?: boolean;
}

export const PreWorldPremiseInput = ({ value, suggested, onChange, disabled }: Props) => {
  const len = value.trim().length;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="pre-world-premise" className="text-sm font-medium flex items-center gap-1.5">
          <Hourglass className="h-3.5 w-3.5 text-primary/70" />
          Premisa Pradávna
          <span className="text-[10px] font-normal text-muted-foreground">(volitelné)</span>
        </Label>
        {suggested && value.length > 0 && (
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <Sparkles className="h-3 w-3" /> Návrh AI — uprav, pokud chceš
          </Badge>
        )}
      </div>
      <Textarea
        id="pre-world-premise"
        value={value}
        onChange={(e) => onChange(e.target.value, false)}
        placeholder="Co bylo před Zlomem? Civilizace, pád, mýtus, který stále utváří současnost. Nech prázdné — AI odvodí ze současné premise."
        rows={3}
        className="resize-none"
        disabled={disabled}
      />
      <p className="text-[10px] text-muted-foreground">
        Pradávná éra určí pradávné rody (lineage) a fyzické pozůstatky (ruiny, oltáře) na mapě.
        {len > 0 && len < 30 && " · Příliš krátké, AI doplní."}
      </p>
    </div>
  );
};
