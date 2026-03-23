import { Badge } from "@/components/ui/badge";
import { SYSTEM_NODES, AGENCY_LAYERS, type AgencyLevel } from "./observatoryData";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

const ICONS: Record<AgencyLevel, typeof CheckCircle2> = {
  direct: CheckCircle2,
  indirect: AlertTriangle,
  none: XCircle,
};

const AgencyMapPanel = () => {
  const grouped = {
    direct: SYSTEM_NODES.filter((n) => n.agency === "direct"),
    indirect: SYSTEM_NODES.filter((n) => n.agency === "indirect"),
    none: SYSTEM_NODES.filter((n) => n.agency === "none"),
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Mapuje, co hráč může přímo ovlivnit, nepřímo ovlivnit, nebo vůbec neovlivní.
        Systémy s přímým vlivem = skutečný gameplay. Ostatní = simulace nebo fake mechanika.
      </p>

      {(["direct", "indirect", "none"] as AgencyLevel[]).map((level) => {
        const layer = AGENCY_LAYERS[level];
        const Icon = ICONS[level];
        const nodes = grouped[level];

        return (
          <div key={level} className="border rounded-lg p-3" style={{ borderColor: layer.color + "40" }}>
            <div className="flex items-center gap-2 mb-2">
              <Icon className="h-4 w-4" style={{ color: layer.color }} />
              <h3 className="font-bold text-sm" style={{ color: layer.color }}>
                {layer.label}
              </h3>
              <Badge variant="outline" className="text-[10px] ml-auto">
                {nodes.length} systémů
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-3">{layer.description}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {nodes.map((node) => (
                <div
                  key={node.id}
                  className="border rounded-md p-2 bg-card/50"
                  style={{ borderLeftWidth: 3, borderLeftColor: layer.color }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs font-bold">{node.label}</span>
                    <span className="text-[10px] text-muted-foreground">
                      PI:{node.playerInfluenceScore} AI:{node.aiDependencyScore} UI:{node.uiSurfacingLevel}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-tight mb-1">
                    {node.description}
                  </p>
                  {node.gaps.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {node.gaps.map((g) => (
                        <Badge key={g} variant="destructive" className="text-[9px] h-4 px-1">
                          {g}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2 pt-2 border-t">
        {(["direct", "indirect", "none"] as AgencyLevel[]).map((level) => {
          const nodes = grouped[level];
          const avgPI = nodes.length ? (nodes.reduce((s, n) => s + n.playerInfluenceScore, 0) / nodes.length).toFixed(1) : "0";
          const deadCount = nodes.filter((n) => n.gaps.includes("Dead metric")).length;
          return (
            <div key={level} className="text-center p-2 rounded bg-card border">
              <p className="text-lg font-bold" style={{ color: AGENCY_LAYERS[level].color }}>
                {nodes.length}
              </p>
              <p className="text-[10px] text-muted-foreground">Avg PI: {avgPI}</p>
              {deadCount > 0 && (
                <p className="text-[10px] text-red-400">{deadCount} dead</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AgencyMapPanel;
