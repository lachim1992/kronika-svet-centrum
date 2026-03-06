import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import FactionDesigner from "@/components/FactionDesigner";
import CivilizationDNA from "@/components/CivilizationDNA";
import CivIdentityPreview from "@/components/CivIdentityPreview";
import EntityTraitsPanel from "@/components/EntityTraitsPanel";
import DiplomacyPanel from "@/components/DiplomacyPanel";
import WarRoomPanel from "@/components/WarRoomPanel";
import LeaderboardsPanel from "@/components/LeaderboardsPanel";
import DeclarationsPanel from "@/components/DeclarationsPanel";
import SecretObjectivesPanel from "@/components/SecretObjectivesPanel";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Sparkles, ScrollText, Feather, Swords, Trophy, Megaphone, Target, BarChart3 } from "lucide-react";

interface Props {
  sessionId: string;
  session?: any;
  events: any[];
  memories: any[];
  players: any[];
  cities: any[];
  wonders: any[];
  armies: any[];
  entityTraits: any[];
  civilizations: any[];
  declarations: any[];
  worldCrises: any[];
  secretObjectives: any[];
  cityStates: any[];
  resources: any[];
  chronicles: any[];
  currentPlayerName: string;
  currentTurn: number;
  myRole: string;
  onRefetch: () => void;
}

const CivTab = ({
  sessionId, session, events, memories, players, cities, wonders, armies, entityTraits,
  civilizations, declarations, worldCrises, secretObjectives, cityStates, resources, chronicles,
  currentPlayerName, currentTurn, myRole, onRefetch,
}: Props) => {
  const [identityData, setIdentityData] = useState<any>(null);
  const [identityLoading, setIdentityLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setIdentityLoading(true);
      const { data } = await supabase
        .from("civ_identity")
        .select("*")
        .eq("session_id", sessionId)
        .eq("player_name", currentPlayerName)
        .maybeSingle();
      setIdentityData(data);
      setIdentityLoading(false);
    };
    load();
  }, [sessionId, currentPlayerName]);

  return (
    <div className="space-y-4 pb-20">
      <Accordion type="multiple" defaultValue={["identity", "civdna"]} className="space-y-2">
        {/* Identity Stats — read-only overview of all modifiers */}
        <AccordionItem value="identity" className="manuscript-card">
          <AccordionTrigger className="px-4 py-3 font-display text-sm">
            <span className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" />Staty civilizace</span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            {identityLoading ? (
              <p className="text-sm text-muted-foreground text-center py-4">Načítám…</p>
            ) : identityData ? (
              <CivIdentityPreview
                sessionId={sessionId}
                playerName={currentPlayerName}
                civDescription={identityData.source_description || ""}
                identityData={identityData}
                loading={false}
                error={null}
                onExtract={() => {}}
                onBack={() => {}}
                onConfirm={() => {}}
                readOnly
              />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Identita civilizace zatím nebyla vygenerována. Použijte sekci "Moje civilizace" níže.
              </p>
            )}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="civdna" className="manuscript-card">
          <AccordionTrigger className="px-4 py-3 font-display text-sm">
            <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />Moje civilizace</span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <FactionDesigner sessionId={sessionId} playerName={currentPlayerName} onComplete={() => { onRefetch(); /* reload identity */ supabase.from("civ_identity").select("*").eq("session_id", sessionId).eq("player_name", currentPlayerName).maybeSingle().then(({ data }) => setIdentityData(data)); }} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="traits" className="manuscript-card">
          <AccordionTrigger className="px-4 py-3 font-display text-sm">
            <span className="flex items-center gap-2"><ScrollText className="h-4 w-4 text-primary" />Národy & vlastnosti</span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <EntityTraitsPanel
              sessionId={sessionId} traits={entityTraits} cities={cities} events={events}
              players={players.map(p => p.player_name)} currentTurn={currentTurn} onRefetch={onRefetch}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="diplomacy" className="manuscript-card">
          <AccordionTrigger className="px-4 py-3 font-display text-sm">
            <span className="flex items-center gap-2"><Feather className="h-4 w-4 text-primary" />Diplomacie</span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <DiplomacyPanel sessionId={sessionId} players={players} cityStates={cityStates} currentPlayerName={currentPlayerName} gameMode={undefined} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="warroom" className="manuscript-card">
          <AccordionTrigger className="px-4 py-3 font-display text-sm">
            <span className="flex items-center gap-2"><Swords className="h-4 w-4 text-primary" />Válečná mapa</span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <WarRoomPanel sessionId={sessionId} currentPlayerName={currentPlayerName} currentTurn={currentTurn} gameMode={session?.game_mode} cities={cities} armies={armies} events={events} players={players} worldCrises={worldCrises} onRefetch={onRefetch} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="leaderboards" className="manuscript-card">
          <AccordionTrigger className="px-4 py-3 font-display text-sm">
            <span className="flex items-center gap-2"><Trophy className="h-4 w-4 text-primary" />Žebříčky</span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <LeaderboardsPanel players={players} cities={cities} resources={resources} armies={armies} wonders={wonders} events={events} chronicles={chronicles} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="declarations" className="manuscript-card">
          <AccordionTrigger className="px-4 py-3 font-display text-sm">
            <span className="flex items-center gap-2"><Megaphone className="h-4 w-4 text-primary" />Vyhlášení</span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <DeclarationsPanel
              sessionId={sessionId} currentPlayerName={currentPlayerName}
              declarations={declarations} currentTurn={currentTurn}
              cities={cities} players={players} events={events} memories={memories}
              gameMode={undefined} onRefetch={onRefetch}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="objectives" className="manuscript-card">
          <AccordionTrigger className="px-4 py-3 font-display text-sm">
            <span className="flex items-center gap-2"><Target className="h-4 w-4 text-primary" />Tajné cíle</span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <SecretObjectivesPanel
              sessionId={sessionId} currentPlayerName={currentPlayerName}
              secretObjectives={secretObjectives} currentTurn={currentTurn} onRefetch={onRefetch}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

export default CivTab;
