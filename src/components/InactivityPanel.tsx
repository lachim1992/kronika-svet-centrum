import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserX, Bot, Clock, Shield, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  myRole: string;
  players: any[];
}

interface ActivityRecord {
  id: string;
  player_name: string;
  last_action_at: string;
  is_delegated: boolean;
  delegated_to: string | null;
  delegation_style: string;
}

const DELEGATION_STYLES = [
  { value: "conservative", label: "Konzervativní — AI udržuje status quo" },
  { value: "expansive", label: "Expanzivní — AI aktivně roste" },
  { value: "defensive", label: "Defenzivní — AI se brání, neútočí" },
];

const InactivityPanel = ({ sessionId, currentPlayerName, myRole, players }: Props) => {
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [serverConfig, setServerConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const [actRes, cfgRes] = await Promise.all([
      supabase.from("player_activity").select("*").eq("session_id", sessionId),
      supabase.from("server_config").select("*").eq("session_id", sessionId).maybeSingle(),
    ]);
    setActivities((actRes.data || []) as ActivityRecord[]);
    setServerConfig(cfgRes.data);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getInactiveHours = (lastAction: string) => {
    return Math.round((Date.now() - new Date(lastAction).getTime()) / (1000 * 60 * 60));
  };

  const isInactive = (activity: ActivityRecord) => {
    const threshold = serverConfig?.inactivity_threshold_hours || 48;
    return getInactiveHours(activity.last_action_at) >= threshold;
  };

  const handleToggleDelegation = async (activity: ActivityRecord) => {
    const newVal = !activity.is_delegated;
    await supabase.from("player_activity")
      .update({
        is_delegated: newVal,
        delegated_to: newVal ? "AI" : null,
      })
      .eq("id", activity.id);
    toast.success(newVal ? `Delegace aktivována pro ${activity.player_name}` : `Delegace zrušena`);
    fetchData();
  };

  const handleStyleChange = async (activityId: string, style: string) => {
    await supabase.from("player_activity").update({ delegation_style: style }).eq("id", activityId);
    toast.success("Styl delegace aktualizován");
    fetchData();
  };

  const handlePing = async () => {
    await supabase.from("player_activity").upsert({
      session_id: sessionId,
      player_name: currentPlayerName,
      last_action_at: new Date().toISOString(),
      is_delegated: false,
    }, { onConflict: "session_id,player_name" });
    toast.success("Aktivita zaznamenána");
    fetchData();
  };

  if (loading) return <p className="text-sm text-muted-foreground">Načítání...</p>;

  const threshold = serverConfig?.inactivity_threshold_hours || 48;
  const isAdmin = myRole === "admin";

  // Get all players and their activity status
  const playerNames = [...new Set(players.map(p => p.player_name))];
  const activityMap = new Map(activities.map(a => [a.player_name, a]));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <UserX className="h-5 w-5 text-primary" />
        <h3 className="font-display font-bold text-base">Neaktivita & delegace</h3>
        <Badge variant="outline" className="ml-auto text-[10px]">Práh: {threshold}h</Badge>
      </div>

      {/* My status */}
      <Card>
        <CardContent className="p-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Vaše aktivita</p>
            <p className="text-[10px] text-muted-foreground">
              {activityMap.has(currentPlayerName)
                ? `Poslední akce: před ${getInactiveHours(activityMap.get(currentPlayerName)!.last_action_at)}h`
                : "Zatím neregistrována"}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={handlePing} className="gap-1">
            <RefreshCw className="h-3 w-3" /> Ping
          </Button>
        </CardContent>
      </Card>

      {/* All players */}
      <div className="space-y-2">
        {playerNames.map(name => {
          const activity = activityMap.get(name);
          const inactive = activity ? isInactive(activity) : false;
          const hours = activity ? getInactiveHours(activity.last_action_at) : null;

          return (
            <Card key={name} className={inactive ? "border-yellow-500/50" : ""}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${inactive ? "bg-yellow-500" : activity ? "bg-primary" : "bg-muted-foreground"}`} />
                    <span className="text-sm font-medium">{name}</span>
                    {activity?.is_delegated && (
                      <Badge variant="secondary" className="text-[9px] gap-1">
                        <Bot className="h-2.5 w-2.5" /> AI řídí
                      </Badge>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {hours !== null ? `${hours}h` : "—"}
                  </div>
                </div>

                {/* Delegation controls (admin or self) */}
                {(isAdmin || name === currentPlayerName) && activity && (
                  <div className="space-y-2 mt-2 pt-2 border-t border-border/50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs">AI delegace</span>
                      <Switch
                        checked={activity.is_delegated}
                        onCheckedChange={() => handleToggleDelegation(activity)}
                      />
                    </div>
                    {activity.is_delegated && (
                      <Select
                        value={activity.delegation_style}
                        onValueChange={v => handleStyleChange(activity.id, v)}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DELEGATION_STYLES.map(s => (
                            <SelectItem key={s.value} value={s.value}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}

                {inactive && !activity?.is_delegated && (
                  <p className="text-[10px] text-yellow-600 mt-1 flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    Neaktivní — doporučujeme aktivovat delegaci
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default InactivityPanel;
