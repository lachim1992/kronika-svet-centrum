import { useState, useCallback, useMemo } from "react";
import {
  Globe, MapPin, Castle, Crown, Swords, Landmark, Calendar,
  ChevronRight, ChevronDown, Mountain, Scroll, Compass, Flag, Building2,
} from "lucide-react";

interface Props {
  countries: any[];
  regions: any[];
  provinces: any[];
  cities: any[];
  wonders: any[];
  persons: any[];
  events: any[];
  expeditions: any[];
  buildings: any[];
  selectedEntity: { type: string; id: string; name: string } | null;
  isEntityVisible: (type: string, id: string, ownerPlayer?: string) => boolean;
  isAdmin: boolean;
  onSelectEntity: (type: string, id: string, name: string) => void;
}

const ChroWikiTreeNav = ({
  countries, regions, provinces, cities, wonders, persons, events, expeditions, buildings,
  selectedEntity, isEntityVisible, isAdmin, onSelectEntity,
}: Props) => {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const toggleNode = useCallback((nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const battles = useMemo(() =>
    events.filter(e => ["battle", "war", "conflict", "siege"].includes(e.event_category?.toLowerCase() || "")),
    [events]
  );

  const discoveries = useMemo(() =>
    expeditions.filter(e => e.status === "resolved"),
    [expeditions]
  );

  const aiBuildings = useMemo(() =>
    buildings.filter(b => b.is_ai_generated),
    [buildings]
  );

  const TreeNode = ({ id, label, icon, type, entityId, children, count, indent = 0 }: {
    id: string; label: string; icon: React.ReactNode; type?: string; entityId?: string;
    children?: React.ReactNode; count?: number; indent?: number;
  }) => {
    const isExpanded = expandedNodes.has(id);
    const hasChildren = !!children;
    const isSelected = selectedEntity?.id === entityId && selectedEntity?.type === type;

    return (
      <div>
        <div
          className={`flex items-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer transition-all text-sm group
            ${isSelected ? "bg-primary/15 text-primary font-semibold" : "hover:bg-muted/60 text-foreground"}
          `}
          style={{ paddingLeft: `${indent * 14 + 8}px` }}
          onClick={() => {
            if (type && entityId) onSelectEntity(type, entityId, label);
            if (hasChildren) toggleNode(id);
          }}
        >
          {hasChildren ? (
            <span className="shrink-0 text-muted-foreground">
              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </span>
          ) : (
            <span className="w-3" />
          )}
          <span className="shrink-0 text-illuminated">{icon}</span>
          <span className="truncate font-display text-xs">{label}</span>
          {count !== undefined && count > 0 && (
            <span className="ml-auto text-[10px] text-muted-foreground font-body">{count}</span>
          )}
        </div>
        {hasChildren && isExpanded && (
          <div className="animate-accordion-down">{children}</div>
        )}
      </div>
    );
  };

  const visibleCountries = countries.filter(c => isEntityVisible("country", c.id, c.ruler_player));
  const visibleRegions = regions.filter(r => isEntityVisible("region", r.id, r.owner_player));
  const visibleProvinces = provinces.filter(p => isEntityVisible("province", p.id, p.owner_player));
  const visibleCities = cities.filter(c => isEntityVisible("city", c.id, c.owner_player));
  const visiblePersons = persons.filter(p => isEntityVisible("person", p.id, p.player_name));
  const visibleWonders = wonders.filter(w => isEntityVisible("wonder", w.id, w.owner_player));

  const regionsForCountry = (countryId: string) => visibleRegions.filter(r => r.country_id === countryId);
  const provincesForRegion = (regionId: string) => visibleProvinces.filter(p => p.region_id === regionId);
  const citiesForProvince = (provinceId: string) => visibleCities.filter(c => c.province_id === provinceId);
  const wondersForCity = (cityName: string) => visibleWonders.filter(w => w.city_name === cityName);
  const orphanRegions = visibleRegions.filter(r => !r.country_id);
  const orphanProvinces = visibleProvinces.filter(p => !p.region_id);

  return (
    <div className="p-2 space-y-0.5">
      {visibleCountries.map(country => (
        <TreeNode key={country.id} id={`country-${country.id}`} label={country.name}
          icon={<Flag className="h-3.5 w-3.5" />} type="country" entityId={country.id}
          count={regionsForCountry(country.id).length} indent={0}>
          {regionsForCountry(country.id).map(region => (
            <TreeNode key={region.id} id={`region-${region.id}`} label={region.name}
              icon={<Mountain className="h-3.5 w-3.5" />} type="region" entityId={region.id}
              count={provincesForRegion(region.id).length} indent={1}>
              {provincesForRegion(region.id).map(prov => (
                <TreeNode key={prov.id} id={`prov-${prov.id}`} label={prov.name}
                  icon={<MapPin className="h-3.5 w-3.5" />} type="province" entityId={prov.id}
                  count={citiesForProvince(prov.id).length} indent={2}>
                  {citiesForProvince(prov.id).map(city => (
                    <TreeNode key={city.id} id={`city-${city.id}`} label={city.name}
                      icon={<Castle className="h-3.5 w-3.5" />} type="city" entityId={city.id} indent={3}>
                      {wondersForCity(city.name).map(w => (
                        <TreeNode key={w.id} id={`w-${w.id}`} label={w.name}
                          icon={<Landmark className="h-3.5 w-3.5" />} type="wonder" entityId={w.id} indent={4} />
                      ))}
                    </TreeNode>
                  ))}
                </TreeNode>
              ))}
            </TreeNode>
          ))}
        </TreeNode>
      ))}

      {orphanRegions.length > 0 && (
        <TreeNode id="orphan-regions" label="Nezařazené regiony"
          icon={<Globe className="h-3.5 w-3.5" />} count={orphanRegions.length} indent={0}>
          {orphanRegions.map(region => (
            <TreeNode key={region.id} id={`region-${region.id}`} label={region.name}
              icon={<Mountain className="h-3.5 w-3.5" />} type="region" entityId={region.id}
              count={provincesForRegion(region.id).length} indent={1}>
              {provincesForRegion(region.id).map(prov => (
                <TreeNode key={prov.id} id={`prov-${prov.id}`} label={prov.name}
                  icon={<MapPin className="h-3.5 w-3.5" />} type="province" entityId={prov.id}
                  count={citiesForProvince(prov.id).length} indent={2}>
                  {citiesForProvince(prov.id).map(city => (
                    <TreeNode key={city.id} id={`city-${city.id}`} label={city.name}
                      icon={<Castle className="h-3.5 w-3.5" />} type="city" entityId={city.id} indent={3} />
                  ))}
                </TreeNode>
              ))}
            </TreeNode>
          ))}
        </TreeNode>
      )}

      {orphanProvinces.length > 0 && (
        <TreeNode id="orphan-provinces" label="Nezařazené provincie"
          icon={<MapPin className="h-3.5 w-3.5" />} count={orphanProvinces.length} indent={0}>
          {orphanProvinces.map(prov => (
            <TreeNode key={prov.id} id={`prov-${prov.id}`} label={prov.name}
              icon={<MapPin className="h-3.5 w-3.5" />} type="province" entityId={prov.id} indent={1} />
          ))}
        </TreeNode>
      )}

      <div className="scroll-divider my-3">
        <span className="text-[10px]">✦ Kategorie ✦</span>
      </div>

      <TreeNode id="cat-persons" label="Osobnosti" icon={<Crown className="h-3.5 w-3.5" />}
        count={visiblePersons.length} indent={0}>
        {visiblePersons.map(p => (
          <TreeNode key={p.id} id={`person-${p.id}`} label={`${p.name}${p.player_name ? ` (${p.player_name})` : ""}`}
            icon={<Crown className="h-3.5 w-3.5" />} type="person" entityId={p.id} indent={1} />
        ))}
      </TreeNode>

      {battles.length > 0 && (
        <TreeNode id="cat-battles" label="Bitvy" icon={<Swords className="h-3.5 w-3.5" />}
          count={battles.length} indent={0}>
          {battles.map(b => (
            <TreeNode key={b.id} id={`battle-${b.id}`} label={b.title}
              icon={<Swords className="h-3.5 w-3.5" />} type="event" entityId={b.id} indent={1} />
          ))}
        </TreeNode>
      )}

      <TreeNode id="cat-wonders" label="Divy světa" icon={<Landmark className="h-3.5 w-3.5" />}
        count={visibleWonders.length} indent={0}>
        {visibleWonders.map(w => (
          <TreeNode key={w.id} id={`wonder-${w.id}`} label={w.name}
            icon={<Landmark className="h-3.5 w-3.5" />} type="wonder" entityId={w.id} indent={1} />
        ))}
      </TreeNode>

      {aiBuildings.length > 0 && (
        <TreeNode id="cat-buildings" label="Stavby" icon={<Building2 className="h-3.5 w-3.5" />}
          count={aiBuildings.length} indent={0}>
          {aiBuildings.map(b => (
            <TreeNode key={b.id} id={`building-${b.id}`} label={b.name}
              icon={<Building2 className="h-3.5 w-3.5" />} type="building" entityId={b.id} indent={1} />
          ))}
        </TreeNode>
      )}

      <TreeNode id="cat-events" label="Události" icon={<Calendar className="h-3.5 w-3.5" />}
        count={events.length} indent={0}>
        {events.slice(0, 50).map(e => (
          <TreeNode key={e.id} id={`event-${e.id}`} label={e.title}
            icon={<Calendar className="h-3.5 w-3.5" />} type="event" entityId={e.id} indent={1} />
        ))}
      </TreeNode>

      {discoveries.length > 0 && (
        <TreeNode id="cat-discoveries" label="Objevy" icon={<Compass className="h-3.5 w-3.5" />}
          count={discoveries.length} indent={0}>
          {discoveries.map(d => (
            <TreeNode key={d.id} id={`disc-${d.id}`} label={d.narrative?.slice(0, 40) || "Výprava"}
              icon={<Compass className="h-3.5 w-3.5" />} type="expedition" entityId={d.id} indent={1} />
          ))}
        </TreeNode>
      )}
    </div>
  );
};

export default ChroWikiTreeNav;
