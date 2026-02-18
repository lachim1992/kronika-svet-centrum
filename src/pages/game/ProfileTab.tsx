import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { User, Save } from "lucide-react";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  myRole: string;
  citiesCount: number;
  eventsCount: number;
  wondersCount: number;
  memoriesCount: number;
  playersCount: number;
  onRefetch: () => void;
}

const ProfileTab = ({
  sessionId, currentPlayerName, myRole,
  citiesCount, eventsCount, wondersCount, memoriesCount, playersCount,
  onRefetch,
}: Props) => {
  const { profile } = useAuth();
  const [username, setUsername] = useState(profile?.username || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ username: username.trim(), bio: bio.trim() })
      .eq("id", profile.id);
    if (error) toast.error("Uložení selhalo");
    else toast.success("Profil uložen");
    setSaving(false);
  };

  return (
    <div className="space-y-4 pb-20">
      <Accordion type="multiple" defaultValue={["profile"]} className="space-y-2">
        <AccordionItem value="profile" className="manuscript-card">
          <AccordionTrigger className="px-4 py-3 font-display text-sm">
            <span className="flex items-center gap-2"><User className="h-4 w-4 text-primary" />Můj profil</span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4 space-y-3">
            <div className="space-y-2">
              <Label>Uživatelské jméno</Label>
              <Input value={username} onChange={e => setUsername(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Bio</Label>
              <Textarea value={bio} onChange={e => setBio(e.target.value)} rows={2} placeholder="Něco o vás..." />
            </div>
            <Button onClick={handleSave} disabled={saving} size="sm">
              <Save className="mr-2 h-3 w-3" />{saving ? "Ukládám..." : "Uložit"}
            </Button>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

export default ProfileTab;
