import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Globe, MapPin, Castle, Crown, Swords, Landmark, Calendar, Users, Search, ChevronLeft } from "lucide-react";

interface Props {
  sessionId: string;
  onEntityClick?: (type: string, id: string) => void;
}

type ViewLevel = "regions" | "region" | "province";

interface ViewState {
  level: ViewLevel;
  regionId?: string;
  regionName?: string;
  provinceId?: string;
  provinceName?: string;
}

const ChroWikiTab = ({ sessionId, onEntityClick }: Props) => {
  const [view, setView] = useState<ViewState>({ level: "regions" });
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");

  // Data states
  const [regions, setRegions] = useState<any[]>([]);
  const [provinces, setProvinces] = useState<any[]>([]);
  const [cities, setCities] = useState<any[]>([]);
  const [wonders, setWonders] = useState<any[]>([]);
  const [persons, setPersons] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [chronicles, setChronicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all data once
  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    Promise.all([
      supabase.from("regions").select("*").eq("session_id", sessionId),
      supabase.from("provinces").select("*").eq("session_id", sessionId),
      supabase.from("cities").select("*").eq("session_id", sessionId),
      supabase.from("wonders").select("*").eq("session_id", sessionId),
      supabase.from("great_persons").select("*").eq("session_id", sessionId),
      supabase.from("world_events").select("*").eq("session_id", sessionId).eq("status", "published").order("created_at", { ascending: false }).limit(200),
      supabase.from("chronicle_entries").select("*").eq("session_id", sessionId).order("created_at", { ascending: false }).limit(100),
    ]).then(([r, p, c, w, gp, ev, ch]) => {
      setRegions(r.data || []);
      setProvinces(p.data || []);
      setCities(c.data || []);
      setWonders(w.data || []);
      setPersons(gp.data || []);
      setEvents(ev.data || []);
      setChronicles(ch.data || []);
      setLoading(false);
    });
  }, [sessionId]);

  // Derived counts
  const provincesForRegion = (regionId: string) => provinces.filter(p => p.region_id === regionId);
  const citiesForProvince = (provinceId: string) => cities.filter(c => c.province_id === provinceId);
  const citiesForRegion = (regionId: string) => {
    const provIds = provincesForRegion(regionId).map(p => p.id);
    return cities.filter(c => provIds.includes(c.province_id));
  };
  const wondersForCity = (cityName: string) => wonders.filter(w => w.city_name === cityName);
  const personsForCity = (cityId: string) => persons.filter(p => p.city_id === cityId);

  const filteredRegions = useMemo(() => {
    if (!search) return regions;
    const q = search.toLowerCase();
    return regions.filter(r => r.name.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q));
  }, [regions, search]);

  const handleEntityClick = (type: string, id: string) => {
    onEntityClick?.(type, id);
  };

  // Breadcrumb navigation
  const renderBreadcrumb = () => (
    <Breadcrumb className="mb-4">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink className="cursor-pointer" onClick={() => setView({ level: "regions" })}>
            🌍 Svět
          </BreadcrumbLink>
        </BreadcrumbItem>
        {view.regionName && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {view.level === "region" ? (
                <BreadcrumbPage>{view.regionName}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink className="cursor-pointer" onClick={() => setView({ level: "region", regionId: view.regionId, regionName: view.regionName })}>
                  {view.regionName}
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </>
        )}
        {view.provinceName && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{view.provinceName}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );

  // REGIONS LIST
  const renderRegions = () => (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input placeholder="Hledat region…" value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
      </div>
      {filteredRegions.length === 0 && <p className="text-muted-foreground text-sm">Žádné regiony nenalezeny.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {filteredRegions.map(r => {
          const provCount = provincesForRegion(r.id).length;
          const cityCount = citiesForRegion(r.id).length;
          return (
            <Card key={r.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setView({ level: "region", regionId: r.id, regionName: r.name })}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary" />
                  {r.name}
                  {r.is_homeland && <Badge variant="outline" className="text-xs">Domovina</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-1">
                {r.biome && <p>Biom: {r.biome}</p>}
                {r.description && <p className="line-clamp-2">{r.description}</p>}
                <div className="flex gap-3 pt-1">
                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{provCount} provincií</span>
                  <span className="flex items-center gap-1"><Castle className="h-3 w-3" />{cityCount} měst</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );

  // REGION DETAIL
  const renderRegion = () => {
    const region = regions.find(r => r.id === view.regionId);
    if (!region) return <p className="text-muted-foreground">Region nenalezen.</p>;
    const provs = provincesForRegion(region.id);
    const regionCities = citiesForRegion(region.id);
    const regionPersons = persons.filter(p => regionCities.some(c => c.id === p.city_id));

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              {region.name}
              {region.biome && <Badge variant="secondary">{region.biome}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            {(region.ai_description || region.description) && <p>{region.ai_description || region.description}</p>}
            <div className="flex gap-4 text-muted-foreground">
              <span>{provs.length} provincií</span>
              <span>{regionCities.length} měst</span>
              <span>{regionPersons.length} osobností</span>
            </div>
          </CardContent>
        </Card>

        <h3 className="font-display font-semibold text-sm">Provincie</h3>
        {provs.length === 0 && <p className="text-muted-foreground text-sm">Žádné provincie.</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {provs.map(p => {
            const pCities = citiesForProvince(p.id);
            return (
              <Card key={p.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setView({ ...view, level: "province", provinceId: p.id, provinceName: p.name })}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    {p.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {p.description && <p className="line-clamp-2">{p.description}</p>}
                  <span className="flex items-center gap-1 mt-1"><Castle className="h-3 w-3" />{pCities.length} měst</span>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  };

  // PROVINCE DETAIL
  const renderProvince = () => {
    const province = provinces.find(p => p.id === view.provinceId);
    if (!province) return <p className="text-muted-foreground">Provincie nenalezena.</p>;
    const pCities = citiesForProvince(province.id);
    const pWonders = pCities.flatMap(c => wondersForCity(c.name));
    const pPersons = pCities.flatMap(c => personsForCity(c.id));
    const cityNames = pCities.map(c => c.name.toLowerCase());

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              {province.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {(province.ai_description || province.description) && <p>{province.ai_description || province.description}</p>}
          </CardContent>
        </Card>

        <Accordion type="multiple" defaultValue={["cities", "wonders", "persons"]} className="space-y-1">
          {/* Cities */}
          <AccordionItem value="cities">
            <AccordionTrigger className="text-sm font-semibold">
              <span className="flex items-center gap-2"><Castle className="h-4 w-4" /> Města ({pCities.length})</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2">
                {pCities.map(c => (
                  <div key={c.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 cursor-pointer" onClick={() => handleEntityClick("city", c.id)}>
                    <div>
                      <span className="font-medium text-sm">{c.name}</span>
                      <Badge variant="outline" className="ml-2 text-xs">{c.level}</Badge>
                      {c.status !== "ok" && <Badge variant="destructive" className="ml-1 text-xs">{c.status}</Badge>}
                    </div>
                    <span className="text-xs text-muted-foreground">{c.owner_player}</span>
                  </div>
                ))}
                {pCities.length === 0 && <p className="text-xs text-muted-foreground">Žádná města.</p>}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Wonders */}
          <AccordionItem value="wonders">
            <AccordionTrigger className="text-sm font-semibold">
              <span className="flex items-center gap-2"><Landmark className="h-4 w-4" /> Divy ({pWonders.length})</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2">
                {pWonders.map(w => (
                  <div key={w.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 cursor-pointer" onClick={() => handleEntityClick("wonder", w.id)}>
                    <span className="font-medium text-sm">{w.name}</span>
                    <Badge variant="secondary" className="text-xs">{w.status}</Badge>
                  </div>
                ))}
                {pWonders.length === 0 && <p className="text-xs text-muted-foreground">Žádné divy.</p>}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Persons */}
          <AccordionItem value="persons">
            <AccordionTrigger className="text-sm font-semibold">
              <span className="flex items-center gap-2"><Crown className="h-4 w-4" /> Osobnosti ({pPersons.length})</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2">
                {pPersons.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 cursor-pointer" onClick={() => handleEntityClick("person", p.id)}>
                    <div>
                      <span className="font-medium text-sm">{p.name}</span>
                      <Badge variant="outline" className="ml-2 text-xs">{p.person_type}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{p.is_alive ? "Žije" : `✝ kolo ${p.died_round}`}</span>
                  </div>
                ))}
                {pPersons.length === 0 && <p className="text-xs text-muted-foreground">Žádné osobnosti.</p>}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Events */}
          <AccordionItem value="events">
            <AccordionTrigger className="text-sm font-semibold">
              <span className="flex items-center gap-2"><Calendar className="h-4 w-4" /> Události</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2">
                {events.filter(e => {
                  const title = e.title?.toLowerCase() || "";
                  const desc = e.description?.toLowerCase() || "";
                  return cityNames.some(cn => title.includes(cn) || desc.includes(cn));
                }).slice(0, 20).map(e => (
                  <div key={e.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 cursor-pointer" onClick={() => handleEntityClick("event", e.id)}>
                    <span className="font-medium text-sm">{e.title}</span>
                    <Badge variant="outline" className="text-xs">{e.event_category}</Badge>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Chronicles */}
          <AccordionItem value="chronicles">
            <AccordionTrigger className="text-sm font-semibold">
              <span className="flex items-center gap-2"><Swords className="h-4 w-4" /> Kronika provincie</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2">
                {chronicles.filter(ch => {
                  const t = ch.text?.toLowerCase() || "";
                  return cityNames.some(cn => t.includes(cn)) || t.includes(province.name.toLowerCase());
                }).slice(0, 10).map(ch => (
                  <div key={ch.id} className="p-2 border-l-2 border-primary/30 pl-3 text-sm">
                    <p className="line-clamp-3">{ch.text}</p>
                    {ch.turn_from && <span className="text-xs text-muted-foreground">Kola {ch.turn_from}–{ch.turn_to}</span>}
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    );
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground animate-pulse">Načítání ChroWiki…</div>;
  }

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-lg font-bold">📜 ChroWiki</h2>
        <Badge variant="secondary" className="text-xs">Read-only</Badge>
      </div>

      {renderBreadcrumb()}

      <ScrollArea className="max-h-[calc(100vh-220px)]">
        {view.level === "regions" && renderRegions()}
        {view.level === "region" && renderRegion()}
        {view.level === "province" && renderProvince()}
      </ScrollArea>
    </div>
  );
};

export default ChroWikiTab;
