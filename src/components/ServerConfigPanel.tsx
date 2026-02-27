import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Settings, Clock, Users, Gauge, Save } from "lucide-react";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  myRole: string;
}

interface ServerConfigData {
  id: string;
  time_scale: number;
  tick_interval_seconds: number;
  max_players: number;
  inactivity_threshold_hours: number;
  delegation_enabled: boolean;
  economic_params: Record<string, any>;
}

const ServerConfigPanel = ({ sessionId, myRole }: Props) => {
  const [config, setConfig] = useState<ServerConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [timeScale, setTimeScale] = useState(1);
  const [tickInterval, setTickInterval] = useState(60);
  const [maxPlayers, setMaxPlayers] = useState(50);
  const [inactivityHours, setInactivityHours] = useState(48);
  const [delegationEnabled, setDelegationEnabled] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("server_config")
        .select("*")
        .eq("session_id", sessionId)
        .maybeSingle();
      if (data) {
        setConfig(data as any);
        setTimeScale(data.time_scale);
        setTickInterval(data.tick_interval_seconds);
        setMaxPlayers(data.max_players);
        setInactivityHours(data.inactivity_threshold_hours);
        setDelegationEnabled(data.delegation_enabled);
      }
      setLoading(false);
    };
    fetch();
  }, [sessionId]);

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      session_id: sessionId,
      time_scale: timeScale,
      tick_interval_seconds: tickInterval,
      max_players: maxPlayers,
      inactivity_threshold_hours: inactivityHours,
      delegation_enabled: delegationEnabled,
    };

    if (config) {
      await supabase.from("server_config").update(payload).eq("id", config.id);
    } else {
      await supabase.from("server_config").insert(payload);
    }
    toast.success("Konfigurace serveru uložena");
    setSaving(false);
  };

  const handleInit = async () => {
    setSaving(true);
    const { error } = await supabase.from("server_config").insert({
      session_id: sessionId,
      time_scale: 1.0,
      tick_interval_seconds: 60,
      max_players: 50,
      inactivity_threshold_hours: 48,
      delegation_enabled: true,
    });
    if (!error) {
      toast.success("Persistentní server inicializován");
      // Refresh
      const { data } = await supabase.from("server_config").select("*").eq("session_id", sessionId).maybeSingle();
      if (data) {
        setConfig(data as any);
        setTimeScale(data.time_scale);
        setTickInterval(data.tick_interval_seconds);
        setMaxPlayers(data.max_players);
        setInactivityHours(data.inactivity_threshold_hours);
        setDelegationEnabled(data.delegation_enabled);
      }
    }
    setSaving(false);
  };

  if (loading) return <p className="text-sm text-muted-foreground">Načítání...</p>;

  if (!config) {
    return (
      <Card>
        <CardContent className="p-6 text-center space-y-3">
          <Settings className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Tento svět ještě nemá konfiguraci persistentního serveru.</p>
          {(myRole === "admin" || myRole === "moderator") && (
            <Button onClick={handleInit} disabled={saving}>
              Inicializovat persistentní server
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  const isAdmin = myRole === "admin" || myRole === "moderator";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5 text-primary" />
        <h3 className="font-display font-bold text-base">Konfigurace serveru</h3>
        <Badge variant="outline" className="ml-auto text-xs">Persistentní</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Gauge className="h-4 w-4" /> Časová škála
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <Label className="text-xs">Rychlost času (1.0 = reálný čas)</Label>
              <Input
                type="number" min={0.1} max={100} step={0.1}
                value={timeScale} onChange={e => setTimeScale(Number(e.target.value))}
                disabled={!isAdmin}
              />
            </div>
            <div>
              <Label className="text-xs">Interval ticku (sekundy)</Label>
              <Input
                type="number" min={10} max={3600} step={10}
                value={tickInterval} onChange={e => setTickInterval(Number(e.target.value))}
                disabled={!isAdmin}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4" /> Hráči
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <Label className="text-xs">Max. hráčů</Label>
              <Input
                type="number" min={2} max={100}
                value={maxPlayers} onChange={e => setMaxPlayers(Number(e.target.value))}
                disabled={!isAdmin}
              />
            </div>
            <div>
              <Label className="text-xs">Neaktivita (hodiny před AI převzetím)</Label>
              <Input
                type="number" min={1} max={720}
                value={inactivityHours} onChange={e => setInactivityHours(Number(e.target.value))}
                disabled={!isAdmin}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4" /> Delegace & neaktivita
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Switch checked={delegationEnabled} onCheckedChange={setDelegationEnabled} disabled={!isAdmin} />
              <span className="text-sm">Povolit delegaci říší při nepřítomnosti</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {isAdmin && (
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" /> Uložit konfiguraci
        </Button>
      )}
    </div>
  );
};

export default ServerConfigPanel;
