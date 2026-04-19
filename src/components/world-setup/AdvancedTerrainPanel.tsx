import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ChevronDown, Settings2 } from "lucide-react";
import { useState } from "react";

interface Props {
  /** Whether the advanced bulk-lock is enabled. Locks managed paths to current resolved values. */
  overrideEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
}

export const AdvancedTerrainPanel = ({ overrideEnabled, onToggle, disabled }: Props) => {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        disabled={disabled}
        className="flex items-center gap-2 w-full p-2 rounded-md border border-border bg-muted/30 hover:bg-muted text-sm font-medium disabled:opacity-50"
      >
        <Settings2 className="h-4 w-4" />
        <span className="flex-1 text-left">Pokročilé — uzamknout vše</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3 space-y-3">
        <div className="flex items-start gap-3 p-3 rounded-md border border-primary/30 bg-primary/5">
          <Switch
            id="advanced-override-toggle"
            checked={overrideEnabled}
            disabled={disabled}
            onCheckedChange={onToggle}
          />
          <div className="flex-1">
            <Label htmlFor="advanced-override-toggle" className="text-sm font-medium cursor-pointer">
              Zamknout všechny řízené parametry
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Uzamkne velikost, styl, frakce a všechny parametry terénu na aktuální
              hodnoty. AI při regeneraci blueprintu nemůže nic z toho změnit.
              Ručně zamknutá pole zůstávají zamknutá i po vypnutí.
            </p>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
