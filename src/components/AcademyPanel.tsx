import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, GraduationCap, Swords, Users, Star, Skull, TrendingUp, School, Palette } from "lucide-react";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
}

interface Academy {
  id: string;
  city_id: string;
  name: string;
  motto: string | null;
  description: string | null;
  training_philosophy: string | null;
  color_primary: string;
  color_secondary: string;
  profile_athletics: number;
  profile_combat: number;
  profile_culture: number;
  profile_strategy: number;
  profile_brutality: number;
  reputation: number;
  infrastructure: number;
  trainer_level: number;
  nutrition: number;
  corruption: number;
  fan_base: number;
  total_graduates: number;
  total_champions: number;
  total_fatalities: number;
  founded_turn: number;
  last_training_turn: number;
  training_cycle_turns: number;
  status: string;
}

interface Student {
  id: string;
  academy_id: string;
  name: string;
  strength: number;
  endurance: number;
  agility: number;
  tactics: number;
  charisma: number;
  specialty: string;
  traits: string[];
  status: string;
  graduation_turn: number | null;
  training_started_turn: number;
}

const PROFILE_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  athletics: { label: "Atletika", icon: <TrendingUp className="h-3 w-3" />, color: "bg-blue-500" },
  combat: { label: "Boj", icon: <Swords className="h-3 w-3" />, color: "bg-red-500" },
  culture: { label: "Kultura", icon: <Palette className="h-3 w-3" />, color: "bg-purple-500" },
  strategy: { label: "Strategie", icon: <GraduationCap className="h-3 w-3" />, color: "bg-amber-500" },
  brutality: { label: "Brutalita", icon: <Skull className="h-3 w-3" />, color: "bg-rose-800" },
};

const AcademyPanel = ({ sessionId, currentPlayerName, currentTurn }: Props) => {
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [sportFunding, setSportFunding] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: acads }, { data: studs }, { data: realm }] = await Promise.all([
      supabase.from("academies").select("*").eq("session_id", sessionId).eq("player_name", currentPlayerName).order("founded_turn"),
      supabase.from("academy_students").select("*").eq("session_id", sessionId).eq("player_name", currentPlayerName).order("graduation_turn", { ascending: false }),
      supabase.from("realm_resources").select("sport_funding_pct").eq("session_id", sessionId).eq("player_name", currentPlayerName).maybeSingle(),
    ]);
    setAcademies((acads || []) as any);
    setStudents((studs || []) as any);
    setSportFunding(realm?.sport_funding_pct || 0);
    setLoading(false);
  }, [sessionId, currentPlayerName]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleFundingChange = async (val: number[]) => {
    const pct = val[0];
    setSaving(true);
    const { error } = await supabase.from("realm_resources").update({ sport_funding_pct: pct }).eq("session_id", sessionId).eq("player_name", currentPlayerName);
    setSaving(false);
    if (error) {
      toast.error("Nepodařilo se uložit financování");
      return;
    }
    toast.success(`Financování sportu: ${pct}%`);
  };

  const handleUpdateAcademy = async (id: string, updates: Partial<Academy>) => {
    await supabase.from("academies").update(updates as any).eq("id", id);
    setAcademies(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
    toast.success("Akademie aktualizována");
  };

  const selected = academies.find(a => a.id === selectedId);
  const selectedStudents = students.filter(s => s.academy_id === selectedId);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <School className="h-5 w-5 text-primary" />
        <h2 className="font-display font-bold text-lg">Academia & Aréna</h2>
        <Badge variant="outline" className="text-[9px] ml-auto">{academies.length} škol</Badge>
      </div>

      {/* Sport Funding Slider */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-display font-semibold">Financování sportu</span>
            <Badge variant="outline" className="text-[9px]">{sportFunding}% zlata / kolo</Badge>
          </div>
          <Slider
            value={[sportFunding]}
            onValueChange={(val) => setSportFunding(val[0])}
            onValueCommit={handleFundingChange}
            min={0}
            max={20}
            step={1}
            className="w-full"
          />
          <p className="text-[10px] text-muted-foreground">
            Každé kolo se strhne {sportFunding}% ze zlaté rezervy na rozvoj akademií (infrastruktura, výživa, trenéři).
          </p>
        </CardContent>
      </Card>

      <Tabs defaultValue="schools" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="schools" className="font-display text-xs">
            <School className="h-3.5 w-3.5 mr-1" />Školy ({academies.length})
          </TabsTrigger>
          <TabsTrigger value="graduates" className="font-display text-xs">
            <Users className="h-3.5 w-3.5 mr-1" />Absolventi ({students.filter(s => s.status === "graduated" || s.status === "promoted").length})
          </TabsTrigger>
        </TabsList>

        {/* ─── SCHOOLS LIST ─── */}
        <TabsContent value="schools" className="space-y-3">
          {academies.length === 0 ? (
            <Card className="border-border bg-card/50">
              <CardContent className="p-8 text-center">
                <School className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="text-sm text-muted-foreground">Žádné akademie.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Postavte budovu typu Aréna, Stadion nebo Akademie ve vašem městě. Škola vznikne automaticky.
                </p>
              </CardContent>
            </Card>
          ) : (
            academies.map(acad => (
              <Card
                key={acad.id}
                className={`border-border bg-card/50 cursor-pointer transition-colors hover:bg-card/70 ${selectedId === acad.id ? "ring-1 ring-primary" : ""}`}
                onClick={() => setSelectedId(selectedId === acad.id ? null : acad.id)}
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: acad.color_primary }} />
                      <span className="font-display text-sm font-semibold">{acad.name}</span>
                      {acad.total_champions > 0 && <Star className="h-3 w-3 text-yellow-400" />}
                    </div>
                    <Badge variant="outline" className="text-[8px]">Rep: {acad.reputation}</Badge>
                  </div>

                  {/* Profile Bars */}
                  <div className="space-y-1">
                    {Object.entries(PROFILE_LABELS).map(([key, { label, icon, color }]) => {
                      const val = (acad as any)[`profile_${key}`] || 0;
                      return (
                        <div key={key} className="flex items-center gap-1.5">
                          <span className="text-[9px] w-14 flex items-center gap-0.5">{icon}{label}</span>
                          <div className="flex-1 h-1.5 bg-muted/50 rounded-full overflow-hidden">
                            <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${val}%` }} />
                          </div>
                          <span className="text-[8px] font-mono text-muted-foreground w-5 text-right">{val}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Stats row */}
                  <div className="flex items-center gap-2 mt-2 text-[9px] text-muted-foreground">
                    <span>📊 Infra: {acad.infrastructure}</span>
                    <span>🍖 Výživa: {acad.nutrition}</span>
                    <span>🎓 Trenér: {acad.trainer_level}</span>
                    <span>👥 Abs: {acad.total_graduates}</span>
                    {acad.total_fatalities > 0 && <span className="text-red-400">💀 {acad.total_fatalities}</span>}
                  </div>

                  <p className="text-[9px] text-muted-foreground mt-1">
                    Založena: Rok {acad.founded_turn} | Další cyklus: Rok {acad.last_training_turn + acad.training_cycle_turns}
                  </p>

                  {/* Detail panel */}
                  {selectedId === acad.id && (
                    <AcademyDetail
                      academy={acad}
                      students={selectedStudents}
                      onUpdate={(updates) => handleUpdateAcademy(acad.id, updates)}
                    />
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ─── GRADUATES ─── */}
        <TabsContent value="graduates" className="space-y-2">
          {students.filter(s => s.status === "graduated" || s.status === "promoted").length === 0 ? (
            <p className="text-sm text-muted-foreground text-center p-8">Žádní absolventi. Počkejte na dokončení výcvikového cyklu.</p>
          ) : (
            students.filter(s => s.status === "graduated" || s.status === "promoted").map(s => {
              const acad = academies.find(a => a.id === s.academy_id);
              return (
                <div key={s.id} className="p-2 rounded border border-border bg-card flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="font-display text-xs font-semibold truncate">{s.name}</span>
                      <Badge variant="outline" className="text-[7px]">{s.specialty}</Badge>
                      {s.status === "promoted" && <Badge variant="outline" className="text-[7px] border-primary/50 text-primary">🏅 Nominován</Badge>}
                    </div>
                    <p className="text-[9px] text-muted-foreground truncate">{acad?.name || "?"} | Rok {s.graduation_turn}</p>
                  </div>
                  <div className="flex gap-0.5">
                    <StatPill label="S" value={s.strength} />
                    <StatPill label="V" value={s.endurance} />
                    <StatPill label="O" value={s.agility} />
                    <StatPill label="T" value={s.tactics} />
                    <StatPill label="C" value={s.charisma} />
                  </div>
                  {s.traits.length > 0 && (
                    <span className="text-[8px] text-muted-foreground">{s.traits.join(", ")}</span>
                  )}
                </div>
              );
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

/* ─── Academy Detail ─── */
function AcademyDetail({ academy, students, onUpdate }: {
  academy: Academy;
  students: Student[];
  onUpdate: (updates: Partial<Academy>) => void;
}) {
  const [motto, setMotto] = useState(academy.motto || "");
  const [philosophy, setPhilosophy] = useState(academy.training_philosophy || "");

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-3">
      <div>
        <label className="text-[10px] font-display font-semibold text-muted-foreground">Motto</label>
        <div className="flex gap-1 mt-0.5">
          <input
            className="flex-1 text-xs bg-muted/30 border border-border rounded px-2 py-1"
            value={motto}
            onChange={(e) => setMotto(e.target.value)}
            placeholder="Per aspera ad astra…"
          />
          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => onUpdate({ motto })}>
            Uložit
          </Button>
        </div>
      </div>

      <div>
        <label className="text-[10px] font-display font-semibold text-muted-foreground">Výcviková filozofie</label>
        <Textarea
          className="text-xs mt-0.5 min-h-[60px]"
          value={philosophy}
          onChange={(e) => setPhilosophy(e.target.value)}
          placeholder="Popište styl výcviku, stravovací režim, disciplinární pravidla…"
        />
        <Button size="sm" variant="outline" className="h-7 text-[10px] mt-1" onClick={() => onUpdate({ training_philosophy: philosophy })}>
          Uložit filozofii
        </Button>
      </div>

      {/* Students in this academy */}
      {students.length > 0 && (
        <div>
          <p className="text-[10px] font-display font-semibold text-muted-foreground mb-1">
            Studenti & Absolventi ({students.length})
          </p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {students.map(s => (
              <div key={s.id} className="flex items-center justify-between text-[9px] p-1 rounded bg-muted/20">
                <span className="font-semibold">{s.name}</span>
                <span className="text-muted-foreground">{s.specialty} | S{s.strength} V{s.endurance} O{s.agility}</span>
                <Badge variant="outline" className="text-[7px]">{s.status}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Stat Pill ─── */
function StatPill({ label, value }: { label: string; value: number }) {
  const color = value >= 70 ? "text-green-400" : value >= 50 ? "text-foreground" : "text-red-400";
  return (
    <span className={`text-[8px] font-mono ${color} bg-muted/50 px-1 rounded`}>
      {label}{value}
    </span>
  );
}

export default AcademyPanel;
