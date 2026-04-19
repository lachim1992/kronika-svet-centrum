// SpecFieldEditor — inline editor for top-level + terrain leaf fields.
// Disabled when isBusy (G5). Each field has a lock toggle.

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SpecLockBadge } from "./SpecLockBadges";
import type { WorldgenSpecV1, WorldSize } from "@/types/worldBootstrap";

interface Props {
  resolved: WorldgenSpecV1;
  lockedPathSet: Set<string>;
  disabled: boolean;
  onEdit: (path: string, value: unknown) => void;
  onLockToggle: (path: string) => void;
}

const TONES: Array<{ value: string; label: string }> = [
  { value: "realistic", label: "📜 Realistický" },
  { value: "mythic", label: "🏛️ Mýtický" },
  { value: "dark_fantasy", label: "🌑 Dark Fantasy" },
  { value: "heroic", label: "⚔️ Hrdinský" },
  { value: "grim", label: "💀 Drsný" },
];

const VICTORY: Array<{ value: string; label: string }> = [
  { value: "story", label: "📖 Příběh" },
  { value: "domination", label: "⚔️ Dominace" },
  { value: "survival", label: "🛡️ Přežití" },
  { value: "sandbox", label: "🌍 Sandbox" },
];

const SIZES: Array<{ value: WorldSize; label: string }> = [
  { value: "small", label: "Malý (21×21)" },
  { value: "medium", label: "Střední (31×31)" },
  { value: "large", label: "Velký (41×41)" },
];

const SHAPES = [
  { value: "pangaea", label: "Jediná pevnina" },
  { value: "two_continents", label: "Dva kontinenty" },
  { value: "archipelago", label: "Souostroví" },
  { value: "crescent", label: "Půlměsíc" },
  { value: "mixed", label: "Smíšený" },
];

function FieldRow({
  path,
  label,
  children,
  lockedPathSet,
  disabled,
  onLockToggle,
}: {
  path: string;
  label: string;
  children: React.ReactNode;
  lockedPathSet: Set<string>;
  disabled: boolean;
  onLockToggle: (p: string) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-1">
        <Label className="text-xs">{label}</Label>
        <SpecLockBadge
          isLocked={lockedPathSet.has(path)}
          onToggle={() => onLockToggle(path)}
          disabled={disabled}
        />
      </div>
      {children}
    </div>
  );
}

export const SpecFieldEditor = ({
  resolved,
  lockedPathSet,
  disabled,
  onEdit,
  onLockToggle,
}: Props) => {
  return (
    <div className="space-y-4">
      {/* Identity */}
      <div className="space-y-3">
        <FieldRow
          path="userIntent.worldName"
          label="Název světa"
          lockedPathSet={lockedPathSet}
          disabled={disabled}
          onLockToggle={onLockToggle}
        >
          <Input
            value={resolved.userIntent.worldName}
            onChange={(e) => onEdit("userIntent.worldName", e.target.value)}
            disabled={disabled}
            placeholder="Středosvět"
          />
        </FieldRow>

        <div className="grid grid-cols-2 gap-3">
          <FieldRow
            path="userIntent.tone"
            label="Styl"
            lockedPathSet={lockedPathSet}
            disabled={disabled}
            onLockToggle={onLockToggle}
          >
            <Select
              value={resolved.userIntent.tone}
              onValueChange={(v) => onEdit("userIntent.tone", v)}
              disabled={disabled}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TONES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>

          <FieldRow
            path="userIntent.victoryStyle"
            label="Zaměření"
            lockedPathSet={lockedPathSet}
            disabled={disabled}
            onLockToggle={onLockToggle}
          >
            <Select
              value={resolved.userIntent.victoryStyle}
              onValueChange={(v) => onEdit("userIntent.victoryStyle", v)}
              disabled={disabled}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {VICTORY.map((v) => (
                  <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FieldRow
            path="userIntent.size"
            label="Velikost"
            lockedPathSet={lockedPathSet}
            disabled={disabled}
            onLockToggle={onLockToggle}
          >
            <Select
              value={resolved.userIntent.size}
              onValueChange={(v) => onEdit("userIntent.size", v as WorldSize)}
              disabled={disabled}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SIZES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>

          <FieldRow
            path="factionCount"
            label="Počet AI frakcí"
            lockedPathSet={lockedPathSet}
            disabled={disabled}
            onLockToggle={onLockToggle}
          >
            <div className="space-y-1">
              <Slider
                min={0}
                max={6}
                step={1}
                value={[resolved.factionCount]}
                disabled={disabled}
                onValueChange={(v) => onEdit("factionCount", v[0])}
              />
              <div className="text-[10px] text-muted-foreground text-right">
                {resolved.factionCount}
              </div>
            </div>
          </FieldRow>
        </div>

        <FieldRow
          path="userIntent.style"
          label="Tematické zaměření"
          lockedPathSet={lockedPathSet}
          disabled={disabled}
          onLockToggle={onLockToggle}
        >
          <Input
            value={resolved.userIntent.style}
            onChange={(e) => onEdit("userIntent.style", e.target.value)}
            disabled={disabled}
            placeholder="např. nautical, frontier, imperial"
          />
        </FieldRow>
      </div>

      {/* Terrain leaf editors */}
      <div className="space-y-3 pt-3 border-t border-border">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Terén
        </div>

        <FieldRow
          path="terrain.targetLandRatio"
          label={`Hustota pevniny (${Math.round(resolved.terrain.targetLandRatio * 100)}%)`}
          lockedPathSet={lockedPathSet}
          disabled={disabled}
          onLockToggle={onLockToggle}
        >
          <Slider
            min={10}
            max={90}
            step={5}
            disabled={disabled}
            value={[Math.round(resolved.terrain.targetLandRatio * 100)]}
            onValueChange={(v) => onEdit("terrain.targetLandRatio", v[0] / 100)}
          />
        </FieldRow>

        <FieldRow
          path="terrain.mountainDensity"
          label={`Hustota hor (${Math.round(resolved.terrain.mountainDensity * 100)}%)`}
          lockedPathSet={lockedPathSet}
          disabled={disabled}
          onLockToggle={onLockToggle}
        >
          <Slider
            min={0}
            max={80}
            step={5}
            disabled={disabled}
            value={[Math.round(resolved.terrain.mountainDensity * 100)]}
            onValueChange={(v) => onEdit("terrain.mountainDensity", v[0] / 100)}
          />
        </FieldRow>

        <FieldRow
          path="terrain.continentShape"
          label="Tvar kontinentů"
          lockedPathSet={lockedPathSet}
          disabled={disabled}
          onLockToggle={onLockToggle}
        >
          <Select
            value={resolved.terrain.continentShape}
            onValueChange={(v) => onEdit("terrain.continentShape", v)}
            disabled={disabled}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SHAPES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>

        <FieldRow
          path="terrain.continentCount"
          label={`Počet kontinentů (${resolved.terrain.continentCount})`}
          lockedPathSet={lockedPathSet}
          disabled={disabled}
          onLockToggle={onLockToggle}
        >
          <Slider
            min={1}
            max={6}
            step={1}
            disabled={disabled}
            value={[resolved.terrain.continentCount]}
            onValueChange={(v) => onEdit("terrain.continentCount", v[0])}
          />
        </FieldRow>
      </div>
    </div>
  );
};
