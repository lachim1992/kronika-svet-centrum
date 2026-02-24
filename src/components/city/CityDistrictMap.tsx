import { Badge } from "@/components/ui/badge";
import { DISTRICT_TYPES, MAX_DISTRICTS } from "@/lib/cityGovernance";

interface Props {
  districts: any[];
  settlementLevel: string;
}

/** Schematic grid visualization of city districts */
const CityDistrictMap = ({ districts, settlementLevel }: Props) => {
  const maxSlots = MAX_DISTRICTS[settlementLevel] || 2;
  const slots: (any | null)[] = [
    ...districts,
    ...Array(Math.max(0, maxSlots - districts.length)).fill(null),
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
        const tmpl = DISTRICT_TYPES[d.district_type];
        const isBuilding = d.status === "building";
        return (
          <div
            key={d.id}
            className={`h-20 rounded-lg border flex flex-col items-center justify-center gap-0.5 p-1 transition-colors ${
              isBuilding
                ? "border-muted bg-muted/20 animate-pulse"
                : "border-border bg-card hover:border-primary/40"
            }`}
          >
            <span className="text-xl">{tmpl?.icon || "🏘️"}</span>
            <span className="text-[9px] font-display font-semibold text-center leading-tight line-clamp-1">
              {d.name}
            </span>
            {isBuilding ? (
              <Badge variant="outline" className="text-[7px] h-3.5 px-1">🏗️ Stavba</Badge>
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
