import { Badge } from "@/components/ui/badge";
import { MAX_DISTRICTS } from "@/lib/cityGovernance";
import { districtsTowardHousingLimit, isLegacyProductionDistrict, storedDistrictBlueprint } from "@/lib/cityDistricts";

interface Props {
  districts: any[];
  settlementLevel: string;
  parcelEconomyVersion?: number;
}

/** Schematic grid visualization of city districts */
const CityDistrictMap = ({ districts, settlementLevel, parcelEconomyVersion = 0 }: Props) => {
  const maxSlots = MAX_DISTRICTS[settlementLevel] || 2;
  const countedDistricts = districtsTowardHousingLimit(districts, parcelEconomyVersion);
  const slots: (any | null)[] = [
    ...districts,
    ...Array(Math.max(0, maxSlots - countedDistricts.length)).fill(null),
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {slots.map((d, i) => {
        if (!d) {
          return (
            <div
              key={`empty-${i}`}
              className="h-20 rounded-lg border-2 border-dashed border-muted-foreground/20 flex items-center justify-center"
            >
              <span className="text-[10px] text-muted-foreground/40">Prázdný slot</span>
            </div>
          );
        }
        const tmpl = storedDistrictBlueprint(d);
        const legacyIcon = ({ artisan: "⚒️", temple: "⛪", market: "🏪", military: "⚔️", farm: "🌾" } as Record<string, string>)[d.district_type];
        const isBuilding = d.status === "building";
        const legacyProduction = isLegacyProductionDistrict(d, parcelEconomyVersion);
        return (
          <div
            key={d.id}
            className={`h-20 rounded-lg border flex flex-col items-center justify-center gap-0.5 p-1 transition-colors ${
              isBuilding
                ? "border-muted bg-muted/20 animate-pulse"
                : "border-border bg-card hover:border-primary/40"
            }`}
          >
            <span className="text-xl">{tmpl ? (tmpl.district_type === "production" ? (tmpl.key === "farm_belt" ? "🌾" : "⚒️") : "🏘️") : (legacyIcon || "🏘️")}</span>
            <span className="text-[9px] font-display font-semibold text-center leading-tight line-clamp-1">
              {d.name}
            </span>
            {isBuilding ? (
              <Badge variant="outline" className="text-[7px] h-3.5 px-1">🏗️ Stavba</Badge>
            ) : legacyProduction ? (
              <Badge variant="outline" className="text-[7px] h-3.5 px-1">Legacy — neaktivní</Badge>
            ) : (
              <span className="text-[8px] text-muted-foreground">👥{d.population_capacity}</span>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default CityDistrictMap;
