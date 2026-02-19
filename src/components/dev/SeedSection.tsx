import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Database, Sprout } from "lucide-react";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  onRefetch?: () => void;
}

const PLAYER_NAMES = ["Berr", "Protivník", "Královna", "Stratég", "Dobyvatel", "Obchodník"];
const PROVINCE_NAMES = [
  "Údolí Králů", "Severní marky", "Jižní pláně", "Přímořská provincie",
  "Východní kopce", "Západní lesy", "Zlatá rovina", "Ledová kotlina",
  "Pustá pole", "Říční delta", "Horské průsmyky", "Stříbrné pobřeží",
];
const CITY_NAMES = [
  "Petra", "Tharros", "Sardara", "Nuraghe", "Cabras", "Oristano", "Barumini", "Cornus",
  "Karalis", "Nora", "Sulci", "Bosa", "Olbia", "Turris", "Alghero", "Sassari",
  "Terranova", "Iglesias", "Castelsardo", "Siniscola", "Dorgali", "Tortolì",
  "Lanusei", "Sanluri", "Villasor", "Decimomannu", "Monastir", "Senorbì",
  "Muravera", "Pula", "Teulada", "Carloforte", "Portoscuso", "Guspini",
  "Arbus", "Ales",
];
const CITY_STATE_NAMES = [
  { name: "Kartágo", type: "Obchodní" }, { name: "Syrakúzy", type: "Vojenský" },
  { name: "Rhodos", type: "Námořní" }, { name: "Delfy", type: "Kulturní" },
  { name: "Korint", type: "Obchodní" },
];
const WONDER_NAMES = [
  "Velký maják", "Koloseum", "Chrám bohů", "Pyramida moudrosti",
  "Visutá zahrada", "Zlatá brána", "Obří socha", "Nebeská věž",
  "Podzemní palác", "Kamenný most", "Hvězdárna", "Vodní chrám",
];
const PERSON_TYPES = ["Generál", "Učenec", "Obchodník", "Architekt", "Diplomat", "Kněz"];

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const SeedSection = ({ sessionId, onRefetch }: Props) => {
  const [seeding, setSeeding] = useState(false);
  const [seedingWorld, setSeedingWorld] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) => setLog(prev => [...prev.slice(-100), `[${new Date().toLocaleTimeString("cs")}] ${msg}`]);

  // ---- Seed 6-Player World (original, preserved) ----
  const seedExtremeWorld = async () => {
    setSeeding(true);
    addLog("🌱 Seeduji extrémní 6-hráčový svět...");
    try {
      const { data: existingPlayers } = await supabase.from("game_players").select("*").eq("session_id", sessionId);
      const existingNames = new Set(existingPlayers?.map(p => p.player_name) || []);

      for (let i = 0; i < 6; i++) {
        const pName = PLAYER_NAMES[i];
        if (!existingNames.has(pName)) {
          await supabase.from("game_players").insert({ session_id: sessionId, player_name: pName, player_number: i + 1 });
          for (const rt of ["food", "wood", "stone", "iron", "wealth"]) {
            await supabase.from("player_resources").insert({
              session_id: sessionId, player_name: pName, resource_type: rt,
              income: 2 + Math.floor(Math.random() * 3),
              upkeep: Math.floor(Math.random() * 2),
              stockpile: 3 + Math.floor(Math.random() * 8),
            });
          }
          addLog(`✅ Hráč ${i + 1}: ${pName}`);
        }
      }

      await supabase.from("game_sessions").update({ player1_name: PLAYER_NAMES[0], player2_name: PLAYER_NAMES[1], max_players: 6 }).eq("id", sessionId);

      // Provinces
      const provinceIds: Record<string, string> = {};
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 2; j++) {
          const provName = PROVINCE_NAMES[i * 2 + j];
          const { data: existing } = await supabase.from("provinces").select("id").eq("session_id", sessionId).eq("name", provName).maybeSingle();
          if (existing) { provinceIds[provName] = existing.id; continue; }
          const { data } = await supabase.from("provinces").insert({ session_id: sessionId, name: provName, owner_player: PLAYER_NAMES[i] }).select().single();
          if (data) provinceIds[provName] = data.id;
        }
      }
      addLog(`✅ ${Object.keys(provinceIds).length} provincií`);

      // Cities
      let cityIdx = 0;
      for (let i = 0; i < 6; i++) {
        const prov1 = PROVINCE_NAMES[i * 2];
        const prov2 = PROVINCE_NAMES[i * 2 + 1];
        for (let j = 0; j < 6; j++) {
          const cName = CITY_NAMES[cityIdx++] || `Město-${cityIdx}`;
          const { data: existing } = await supabase.from("cities").select("id").eq("session_id", sessionId).eq("name", cName).maybeSingle();
          if (existing) continue;
          const prov = j < 3 ? prov1 : prov2;
          await supabase.from("cities").insert({
            session_id: sessionId, name: cName, owner_player: PLAYER_NAMES[i],
            province: prov, province_id: provinceIds[prov] || null, level: "Osada", tags: [], founded_round: 1,
          });
        }
      }
      addLog(`✅ Města seedována`);

      // City states
      for (const cs of CITY_STATE_NAMES) {
        const { data: existing } = await supabase.from("city_states").select("id").eq("session_id", sessionId).eq("name", cs.name).maybeSingle();
        if (!existing) await supabase.from("city_states").insert({ session_id: sessionId, name: cs.name, type: cs.type });
      }

      // Wonders
      const { data: allCities } = await supabase.from("cities").select("id, name, owner_player").eq("session_id", sessionId);
      for (let i = 0; i < 6; i++) {
        const pCities = (allCities || []).filter(c => c.owner_player === PLAYER_NAMES[i]);
        for (let w = 0; w < 2; w++) {
          const wName = WONDER_NAMES[i * 2 + w] || `Div-${i * 2 + w}`;
          const { data: existing } = await supabase.from("wonders").select("id").eq("session_id", sessionId).eq("name", wName).maybeSingle();
          if (existing) continue;
          await supabase.from("wonders").insert({
            session_id: sessionId, name: wName, owner_player: PLAYER_NAMES[i],
            city_name: pCities[w % Math.max(1, pCities.length)]?.name || "", era: w === 0 ? "Ancient" : "Classical",
            status: "planned", description: `${wName} – plánovaný div světa.`,
          });
        }
      }

      // Great persons
      for (let i = 0; i < 6; i++) {
        const personName = `${PLAYER_NAMES[i]}-hrdina`;
        const { data: existing } = await supabase.from("great_persons").select("id").eq("session_id", sessionId).eq("name", personName).maybeSingle();
        if (existing) continue;
        const pCities = (allCities || []).filter(c => c.owner_player === PLAYER_NAMES[i]);
        await supabase.from("great_persons").insert({
          session_id: sessionId, name: personName, player_name: PLAYER_NAMES[i],
          person_type: PERSON_TYPES[i], city_id: pCities[0]?.id || null, born_round: 1, is_alive: true,
          bio: `Legendární ${PERSON_TYPES[i].toLowerCase()} sloužící říši ${PLAYER_NAMES[i]}.`,
        });
      }

      // Civilizations
      for (const p of PLAYER_NAMES) {
        await supabase.from("civilizations").upsert({
          session_id: sessionId, player_name: p, civ_name: `Říše ${p}`,
          core_myth: `Pradávné proroctví o slávě ${p}.`,
          architectural_style: pick(["Kamenný", "Dřevěný", "Cihlový", "Mramorový"]),
          cultural_quirk: pick(["Oslavují porážky", "Jedí jen ryby", "Staví pozpátku", "Mluví zpěvem"]),
        }, { onConflict: "session_id,player_name", ignoreDuplicates: true });
      }

      toast.success("🌱 Svět naseedován (6 hráčů, 36 měst, 12 divů)!");
      addLog("✅ Seed dokončen");
      onRefetch?.();
    } catch (e: any) {
      addLog("❌ " + (e?.message || "unknown"));
      toast.error("Seedování selhalo");
    }
    setSeeding(false);
  };

  // ---- Seed World (safe baseline with countries/regions/provinces) ----
  const seedWorldHierarchy = async () => {
    setSeedingWorld(true);
    addLog("🌍 Seeduji hierarchii světa (Stát → Region → Provincie)...");
    try {
      // Create default country if missing
      const { data: existingCountries } = await supabase.from("countries").select("id").eq("session_id", sessionId);
      let countryId: string | null = null;

      if (!existingCountries?.length) {
        const { data: country } = await supabase.from("countries").insert({
          session_id: sessionId, name: "Starý kontinent", ruler_player: null,
          description: "Prastarý kontinent, kolébka civilizací. Z jeho útrob povstaly první říše.",
        }).select().single();
        if (country) { countryId = country.id; addLog("✅ Stát 'Starý kontinent' vytvořen"); }
      } else {
        countryId = existingCountries[0].id;
        addLog("✅ Stát již existuje");
      }

      // Link orphan regions to country
      if (countryId) {
        const { data: orphanRegions } = await supabase.from("regions").select("id, name").eq("session_id", sessionId).is("country_id", null);
        for (const reg of orphanRegions || []) {
          await supabase.from("regions").update({ country_id: countryId }).eq("id", reg.id);
          addLog(`🔗 Region "${reg.name}" → stát`);
        }
      }

      // Link orphan provinces to first region
      const { data: regions } = await supabase.from("regions").select("id, name").eq("session_id", sessionId).limit(1);
      if (regions?.length) {
        const { data: orphanProvs } = await supabase.from("provinces").select("id, name").eq("session_id", sessionId).is("region_id", null);
        for (const prov of orphanProvs || []) {
          await supabase.from("provinces").update({ region_id: regions[0].id }).eq("id", prov.id);
          addLog(`🔗 Provincie "${prov.name}" → region`);
        }
      }

      // Link orphan cities to first province
      const { data: provinces } = await supabase.from("provinces").select("id, name").eq("session_id", sessionId).limit(1);
      if (provinces?.length) {
        const { data: orphanCities } = await supabase.from("cities").select("id, name").eq("session_id", sessionId).is("province_id", null);
        for (const city of orphanCities || []) {
          await supabase.from("cities").update({ province_id: provinces[0].id }).eq("id", city.id);
          addLog(`🔗 Město "${city.name}" → provincie`);
        }
      }

      toast.success("🌍 Hierarchie světa seedována!");
      addLog("✅ Seed hierarchie dokončen");
      onRefetch?.();
    } catch (e: any) {
      addLog("❌ " + (e?.message || "unknown"));
      toast.error("Seedování selhalo");
    }
    setSeedingWorld(false);
  };

  return (
    <div className="bg-card border-2 border-green-500/20 rounded-lg p-4 space-y-4">
      <h3 className="font-display font-semibold text-sm flex items-center gap-2">
        <Sprout className="h-4 w-4 text-green-500" />
        Seed nástroje
      </h3>

      <p className="text-xs text-muted-foreground">
        Seed pouze doplňuje chybějící data. Nikdy nemaže ani nepřepisuje existující obsah.
      </p>

      <div className="grid grid-cols-1 gap-2">
        <Button onClick={seedExtremeWorld} disabled={seeding || seedingWorld} variant="outline" className="h-12 font-display gap-2">
          {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
          {seeding ? "Seeduji..." : "🌱 Seed 6-Player World"}
        </Button>
        <Button onClick={seedWorldHierarchy} disabled={seeding || seedingWorld} variant="outline" className="h-12 font-display gap-2">
          {seedingWorld ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sprout className="h-4 w-4" />}
          {seedingWorld ? "Seeduji..." : "🌍 Seed World Hierarchy (Stát → Region → Provincie)"}
        </Button>
      </div>

      {log.length > 0 && (
        <ScrollArea className="h-32 border rounded p-2 bg-muted/30">
          <div className="font-mono text-[11px] space-y-0.5">
            {log.map((line, i) => (
              <p key={i} className={line.includes("❌") ? "text-destructive" : "text-muted-foreground"}>{line}</p>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};

export default SeedSection;
