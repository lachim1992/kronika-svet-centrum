import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Crown } from "lucide-react";
import { toast } from "sonner";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setIsRecovery(true);
    }
  }, []);

  const handleReset = async () => {
    if (password.length < 6) { toast.error("Heslo musí mít alespoň 6 znaků"); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) toast.error(error.message);
    else {
      toast.success("Heslo bylo změněno!");
      navigate("/");
    }
    setLoading(false);
  };

  if (!isRecovery) {
    return (
      <div className="min-h-screen flex items-center justify-center parchment-bg">
        <div className="text-center space-y-4">
          <Crown className="h-10 w-10 text-primary mx-auto" />
          <p className="text-muted-foreground">Neplatný odkaz pro reset hesla.</p>
          <Button onClick={() => navigate("/auth")}>Zpět na přihlášení</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 parchment-bg">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <Crown className="h-10 w-10 text-primary mx-auto mb-2" />
          <h1 className="text-2xl font-display font-bold">Nové heslo</h1>
        </div>
        <div className="bg-card p-6 rounded-lg shadow-parchment border border-border space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">Nové heslo</Label>
            <Input id="new-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Nové heslo (min. 6 znaků)" />
          </div>
          <Button onClick={handleReset} disabled={loading} className="w-full font-display">
            {loading ? "Ukládám..." : "Změnit heslo"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
