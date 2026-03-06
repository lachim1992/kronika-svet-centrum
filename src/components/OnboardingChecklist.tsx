import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, Compass, Swords, Building2, Map, Users, X, Scroll, Trophy, School, Shield } from "lucide-react";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
  cities: any[];
  armies: any[];
  onTabChange: (tab: string) => void;
  onDismiss: () => void;
}

interface Step {
  id: string;
  icon: typeof Compass;
  label: string;
  desc: string;
  check: () => boolean;
  action?: string;
}

const OnboardingChecklist = ({ sessionId, currentPlayerName, currentTurn, cities, armies, onTabChange, onDismiss }: Props) => {
  const [dismissed, setDismissed] = useState(false);
  const [hasExplored, setHasExplored] = useState(false);
  const [hasDiplomacy, setHasDiplomacy] = useState(false);
  const [hasStadium, setHasStadium] = useState(false);
  const [hasAssociation, setHasAssociation] = useState(false);
  const [hasAcademy, setHasAcademy] = useState(false);
  const [hasTeam, setHasTeam] = useState(false);

  useEffect(() => {
    const key = `onboarding_dismissed_${sessionId}`;
    if (localStorage.getItem(key)) setDismissed(true);

    (async () => {
      const [
        { count: discCount },
        { count: diploCount },
        { count: stadiumCount },
        { count: assocCount },
        { count: academyCount },
        { count: teamCount },
      ] = await Promise.all([
        supabase.from("discoveries").select("id", { count: "exact", head: true })
          .eq("session_id", sessionId).eq("player_name", currentPlayerName),
        supabase.from("diplomacy_messages").select("id", { count: "exact", head: true })
          .eq("sender", currentPlayerName),
        supabase.from("city_buildings").select("id", { count: "exact", head: true })
          .eq("session_id", sessionId).eq("status", "completed").contains("building_tags", ["stadium"]),
        supabase.from("sports_associations").select("id", { count: "exact", head: true })
          .eq("session_id", sessionId).eq("player_name", currentPlayerName),
        supabase.from("academies").select("id", { count: "exact", head: true })
          .eq("session_id", sessionId).eq("player_name", currentPlayerName),
        supabase.from("league_teams").select("id", { count: "exact", head: true })
          .eq("session_id", sessionId).eq("player_name", currentPlayerName).eq("is_active", true),
      ]);
      setHasExplored((discCount || 0) > 3);
      setHasDiplomacy((diploCount || 0) > 0);
      setHasStadium((stadiumCount || 0) > 0);
      setHasAssociation((assocCount || 0) > 0);
      setHasAcademy((academyCount || 0) > 0);
      setHasTeam((teamCount || 0) > 0);
    })();
  }, [sessionId, currentPlayerName, currentTurn]);

  const myCities = cities.filter(c => c.owner_player === currentPlayerName);
  const myArmies = armies.filter((a: any) => a.player_name === currentPlayerName && a.is_active);

  const steps: Step[] = [
    {
      id: "city", icon: Building2,
      label: "Založte město",
      desc: "Vaše první osada je centrem vaší říše.",
      check: () => myCities.length > 0, action: "home",
    },
    {
      id: "explore", icon: Map,
      label: "Prozkoumejte mapu",
      desc: "Odhalte okolní území a sousední říše.",
      check: () => hasExplored, action: "worldmap",
    },
    {
      id: "army", icon: Swords,
      label: "Vytvořte armádu",
      desc: "Naverbujte vojáky na obranu své říše.",
      check: () => myArmies.length > 0, action: "army",
    },
    {
      id: "diplomacy", icon: Users,
      label: "Navažte kontakt",
      desc: "Pošlete diplomatickou zprávu sousedovi.",
      check: () => hasDiplomacy, action: "world",
    },
    {
      id: "turn", icon: Compass,
      label: "Dokončete 3 tahy",
      desc: "Odehrajte alespoň 3 kola a sledujte, jak svět reaguje.",
      check: () => currentTurn >= 3,
    },
    {
      id: "stadium", icon: Building2,
      label: "Postavte Arénu nebo Stadion",
      desc: "Stavba umožní založit sportovní tým a pořádat hry.",
      check: () => hasStadium, action: "home",
    },
    {
      id: "association", icon: Shield,
      label: "Založte sportovní svaz",
      desc: "Svaz řídí vaše týmy a rozvoj sportu v říši.",
      check: () => hasAssociation, action: "games",
    },
    {
      id: "academy", icon: School,
      label: "Založte akademii",
      desc: "Akademie trénuje bojovníky pro ligu i olympiádu.",
      check: () => hasAcademy, action: "games",
    },
    {
      id: "team", icon: Trophy,
      label: "Založte první tým",
      desc: "Přihlaste svůj tým do ligy Sphaery.",
      check: () => hasTeam, action: "games",
    },
  ];

  const completedCount = steps.filter(s => s.check()).length;
  const allDone = completedCount === steps.length;

  if (dismissed || allDone) return null;

  const handleDismiss = () => {
    localStorage.setItem(`onboarding_dismissed_${sessionId}`, "1");
    setDismissed(true);
    onDismiss();
  };

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-display">
            <Scroll className="h-4 w-4 text-primary" />
            Průvodce začátkem
            <span className="text-xs text-muted-foreground font-normal">
              ({completedCount}/{steps.length})
            </span>
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={handleDismiss} className="h-6 w-6 p-0">
            <X className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {steps.map(step => {
          const done = step.check();
          const Icon = step.icon;
          return (
            <button
              key={step.id}
              onClick={() => step.action && onTabChange(step.action)}
              className={`w-full flex items-start gap-3 p-2 rounded-lg text-left transition-colors ${
                done
                  ? "opacity-60"
                  : step.action
                    ? "hover:bg-primary/10 cursor-pointer"
                    : ""
              }`}
              disabled={done}
            >
              {done ? (
                <CheckCircle2 className="h-4 w-4 text-accent mt-0.5 shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              )}
              <div>
                <div className={`text-xs font-semibold ${done ? "line-through" : ""}`}>
                  {step.label}
                </div>
                <div className="text-[10px] text-muted-foreground">{step.desc}</div>
              </div>
              {!done && step.action && (
                <Icon className="h-3.5 w-3.5 text-primary ml-auto mt-0.5 shrink-0" />
              )}
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default OnboardingChecklist;
