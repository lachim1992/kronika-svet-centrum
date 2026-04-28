import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Layers, ChevronUp } from "lucide-react";

export interface LayerToggles {
  province: boolean;
  road: boolean;
  economy: boolean;
  influence: boolean;
  underConstruction: boolean;
  tradeSystems: boolean;
}

export interface ProvinceLegendItem {
  id: string;
  name: string;
  colorIndex: number;
  ownerPlayer: string;
}

interface BiomeKey {
  key: string;
  label: string;
  icon: string;
  color: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layers: LayerToggles;
  onLayersChange: (next: LayerToggles) => void;
  provinceLegend: ProvinceLegendItem[];
  provinceColors: string[];
  biomes: BiomeKey[];
  triggerLabel?: string;
}

const SHORTCUTS: Array<[string, string]> = [
  ["+ / −", "Zoom in / out"],
  ["0", "Reset zoom"],
  ["H", "Hlavní město"],
  ["L", "Vrstvy"],
  ["Esc", "Zrušit výběr"],
  ["WASD / ←↑→↓", "Posun kurzoru"],
  ["Drag", "Posun mapy"],
  ["Kolečko / Pinch", "Zoom"],
];

export default function MapLayersPopover({
  open, onOpenChange, layers, onLayersChange,
  provinceLegend, provinceColors, biomes, triggerLabel = "Vrstvy",
}: Props) {
  const [tab, setTab] = useState("layers");

  const toggle = (key: keyof LayerToggles) => (v: boolean) =>
    onLayersChange({ ...layers, [key]: v });

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1.5 px-2.5 text-[11px] font-display"
        >
          <Layers className="h-3.5 w-3.5" />
          {triggerLabel}
          <ChevronUp className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={8}
        className="w-[320px] p-0 bg-card/95 backdrop-blur-md border-border"
      >
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-4 w-full rounded-none rounded-t-md h-9">
            <TabsTrigger value="layers" className="text-[10px]">Vrstvy</TabsTrigger>
            <TabsTrigger value="biomes" className="text-[10px]">Biomy</TabsTrigger>
            <TabsTrigger value="provinces" className="text-[10px]">Provincie</TabsTrigger>
            <TabsTrigger value="keys" className="text-[10px]">Zkratky</TabsTrigger>
          </TabsList>

          <TabsContent value="layers" className="p-3 m-0 space-y-2">
            <LayerRow label="🗺 Provincie" checked={layers.province} onChange={toggle("province")} />
            <LayerRow label="🛤 Silnice" checked={layers.road} onChange={toggle("road")} />
            <LayerRow label="📈 Ekonomický tok" checked={layers.economy} onChange={toggle("economy")} />
            <LayerRow label="🔀 Trade systems" checked={layers.tradeSystems} onChange={toggle("tradeSystems")} />
            <LayerRow label="🌐 Vliv na uzly" checked={layers.influence} onChange={toggle("influence")} />
            <LayerRow label="🚧 Stavba cest" checked={layers.underConstruction} onChange={toggle("underConstruction")} />
          </TabsContent>

          <TabsContent value="biomes" className="p-3 m-0">
            <ScrollArea className="max-h-[260px]">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px]">
                {biomes.map(b => (
                  <div key={b.key} className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded inline-block border border-border flex-shrink-0"
                      style={{ backgroundColor: b.color }} />
                    <span className="text-muted-foreground">{b.icon} {b.label}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="provinces" className="p-3 m-0">
            {provinceLegend.length === 0 ? (
              <p className="text-[10px] text-muted-foreground italic text-center py-4">
                Žádné objevené provincie
              </p>
            ) : (
              <ScrollArea className="max-h-[260px]">
                <div className="grid grid-cols-1 gap-y-1 text-[10px] pr-2">
                  {provinceLegend.map(p => (
                    <div key={p.id} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm inline-block flex-shrink-0 border border-border"
                        style={{ backgroundColor: provinceColors[p.colorIndex % provinceColors.length] }} />
                      <span className="text-muted-foreground truncate flex-1">{p.name}</span>
                      {p.ownerPlayer && (
                        <span className="text-[9px] text-muted-foreground/60 truncate max-w-[80px]">
                          {p.ownerPlayer}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="keys" className="p-3 m-0">
            <div className="space-y-1.5 text-[10px]">
              {SHORTCUTS.map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between gap-2">
                  <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted/40 font-mono text-[9px]">
                    {key}
                  </kbd>
                  <span className="text-muted-foreground text-right">{desc}</span>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}

function LayerRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 cursor-pointer py-1 px-1 rounded hover:bg-muted/30">
      <span className="text-[11px] text-foreground">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} className="scale-75" />
    </label>
  );
}
