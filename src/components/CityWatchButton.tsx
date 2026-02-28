import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  playerName: string;
  entityType: "city" | "province";
  entityId: string;
  entityName: string;
  size?: "sm" | "icon";
}

const CityWatchButton = ({ sessionId, playerName, entityType, entityId, entityName, size = "sm" }: Props) => {
  const [watching, setWatching] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("player_watches")
        .select("id")
        .eq("session_id", sessionId)
        .eq("player_name", playerName)
        .eq("entity_id", entityId)
        .maybeSingle();
      setWatching(!!data);
      setLoading(false);
    })();
  }, [sessionId, playerName, entityId]);

  const toggle = async () => {
    setLoading(true);
    try {
      if (watching) {
        await supabase
          .from("player_watches")
          .delete()
          .eq("session_id", sessionId)
          .eq("player_name", playerName)
          .eq("entity_id", entityId);
        setWatching(false);
        toast.success(`${entityName} — sledování ukončeno`);
      } else {
        await supabase.from("player_watches").insert({
          session_id: sessionId,
          player_name: playerName,
          entity_type: entityType,
          entity_id: entityId,
          entity_name: entityName,
        });
        setWatching(true);
        toast.success(`${entityName} — sledování zahájeno`);
      }
    } catch {
      toast.error("Nepodařilo se změnit sledování");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return size === "icon" ? (
      <Button variant="ghost" size="icon" className="h-7 w-7" disabled>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </Button>
    ) : (
      <Button variant="ghost" size="sm" disabled className="text-xs h-7 gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
      </Button>
    );
  }

  return size === "icon" ? (
    <Button
      variant="ghost"
      size="icon"
      className={`h-7 w-7 ${watching ? "text-primary" : "text-muted-foreground"}`}
      onClick={toggle}
      title={watching ? "Přestat sledovat" : "Sledovat"}
    >
      {watching ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
    </Button>
  ) : (
    <Button
      variant={watching ? "outline" : "ghost"}
      size="sm"
      className={`text-xs h-7 gap-1 ${watching ? "text-primary" : ""}`}
      onClick={toggle}
    >
      {watching ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
      {watching ? "Přestat sledovat" : "Sledovat"}
    </Button>
  );
};

export default CityWatchButton;
