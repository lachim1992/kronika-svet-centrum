import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, Settings2 } from "lucide-react";
import { useState } from "react";

export interface AdvancedTerrainState {
  overrideEnabled: boolean;
  customWidth: number;
  customHeight: number;
  customSeed: string;
  targetLandRatio: number; // 0..1
  continentShape: string;
  continentCount: number;
  mountainDensity: number; // 0..1
}

interface AdvancedTerrainPanelProps {
  state: AdvancedTerrainState;
  onChange: (next: Partial<AdvancedTerrainState>) => void;
  /** Default size from the chosen world size — used as placeholder for disabled width/height. */
  defaultWidth: number;
  defaultHeight: number;
}

export const AdvancedTerrainPanel = ({
  state,
  onChange,
  defaultWidth,
  defaultHeight,
}: AdvancedTerrainPanelProps) => {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 rounded-md border border-border bg-muted/30 hover:bg-muted text-sm font-medium">
        <Settings2 className="h-4 w-4" />
        <span className="flex-1 text-left">Pokročilé nastavení mapy</span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3 space-y-4">
        {/* R1: Explicit toggle — opening the panel does NOT change resolved spec */}
        <div className="flex items-start gap-3 p-3 rounded-md border border-primary/30 bg-primary/5">
          <Switch
            id="advanced-override-toggle"
            checked={state.overrideEnabled}
            onCheckedChange={(checked) => onChange({ overrideEnabled: checked })}
          />
          <div className="flex-1">
            <Label htmlFor="advanced-override-toggle" className="text-sm font-medium cursor-pointer">
              Použít vlastní parametry mapy
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Otevření panelu samo o sobě nic nemění. Pokud chcete přepsat
              rozměry mapy nebo seed, zapněte tento přepínač.
            </p>
          </div>
        </div>

        {/* Width / height / seed — disabled unless override toggle is on */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Šířka mapy</Label>
            <Input
              type="number"
              min={11}
              max={61}
              value={state.overrideEnabled ? state.customWidth : ""}
              placeholder={String(defaultWidth)}
              disabled={!state.overrideEnabled}
              onChange={(e) =>
                onChange({ customWidth: Math.max(11, Math.min(61, parseInt(e.target.value) || defaultWidth)) })
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Výška mapy</Label>
            <Input
              type="number"
              min={11}
              max={61}
              value={state.overrideEnabled ? state.customHeight : ""}
              placeholder={String(defaultHeight)}
              disabled={!state.overrideEnabled}
              onChange={(e) =>
                onChange({ customHeight: Math.max(11, Math.min(61, parseInt(e.target.value) || defaultHeight)) })
              }
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Vlastní seed (volitelné)</Label>
          <Input
            type="text"
            placeholder="Auto-generován z náhody"
            value={state.customSeed}
            disabled={!state.overrideEnabled}
            onChange={(e) => onChange({ customSeed: e.target.value })}
          />
        </div>

        {/* Terrain knobs — these are always editable (they don't change map size,
            just the terrain distribution within it) */}
        <div className="space-y-3 pt-2 border-t border-border">
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <Label>Hustota pevniny</Label>
              <span className="text-muted-foreground">
                {Math.round(state.targetLandRatio * 100)}%
              </span>
            </div>
            <Slider
              min={10}
              max={90}
              step={5}
              value={[Math.round(state.targetLandRatio * 100)]}
              onValueChange={(v) => onChange({ targetLandRatio: v[0] / 100 })}
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <Label>Hustota hor</Label>
              <span className="text-muted-foreground">
                {Math.round(state.mountainDensity * 100)}%
              </span>
            </div>
            <Slider
              min={0}
              max={80}
              step={5}
              value={[Math.round(state.mountainDensity * 100)]}
              onValueChange={(v) => onChange({ mountainDensity: v[0] / 100 })}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Tvar kontinentů</Label>
            <Select
              value={state.continentShape}
              onValueChange={(v) => onChange({ continentShape: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pangaea">Jediná pevnina</SelectItem>
                <SelectItem value="two_continents">Dva kontinenty</SelectItem>
                <SelectItem value="archipelago">Souostroví</SelectItem>
                <SelectItem value="crescent">Půlměsíc</SelectItem>
                <SelectItem value="mixed">Smíšený</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <Label>Počet kontinentů</Label>
              <span className="text-muted-foreground">{state.continentCount}</span>
            </div>
            <Slider
              min={1}
              max={6}
              step={1}
              value={[state.continentCount]}
              onValueChange={(v) => onChange({ continentCount: v[0] })}
            />
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
