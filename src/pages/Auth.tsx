import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, KeyRound } from "lucide-react";
import { toast } from "sonner";
import ChronicleHubLogo from "@/components/ChronicleHubLogo";

const Auth = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);

  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { toast.error("Vyplňte email a heslo"); return; }
    setLoading(true);

    if (isSignUp) {
      if (!username.trim()) { toast.error("Zadejte uživatelské jméno"); setLoading(false); return; }
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username: username.trim() },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) { toast.error(error.message); }
      else { toast.success("Registrace úspěšná! Zkontrolujte email pro potvrzení."); }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { toast.error(error.message); }
    }
    setLoading(false);
  };

  const handleGoogleSignIn = async () => {
    const { error } = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (error) toast.error("Google přihlášení selhalo");
  };

  const handleResetPassword = async () => {
    if (!email) { toast.error("Zadejte email"); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Email pro reset hesla odeslán!");
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-md w-full space-y-8 animate-fade-in">
        {/* Logo & Title */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <ChronicleHubLogo variant="full" size="lg" />
          </div>
          <p className="text-muted-foreground text-sm">
            {showReset ? "Reset hesla" : isSignUp ? "Vytvořte si účet" : "Přihlaste se ke svému světu"}
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-card p-6 rounded-md border border-border space-y-4">
          {showReset ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input id="reset-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vas@email.cz" />
              </div>
              <Button onClick={handleResetPassword} disabled={loading} className="w-full font-display">
                {loading ? "Odesílám..." : "Odeslat reset"}
              </Button>
              <Button variant="ghost" onClick={() => setShowReset(false)} className="w-full text-sm">
                Zpět na přihlášení
              </Button>
            </>
          ) : (
            <form onSubmit={handleEmailAuth} className="space-y-4">
              {isSignUp && (
                <div className="space-y-2">
                  <Label htmlFor="username">Uživatelské jméno</Label>
                  <Input id="username" value={username} onChange={e => setUsername(e.target.value)} placeholder="Váš herní nick" />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vas@email.cz" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Heslo</Label>
                <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
              </div>
              <Button type="submit" disabled={loading} className="w-full font-display">
                <Mail className="mr-2 h-4 w-4" />
                {loading ? "Čekejte..." : isSignUp ? "Registrovat" : "Přihlásit se"}
              </Button>
              {!isSignUp && (
                <Button type="button" variant="link" onClick={() => setShowReset(true)} className="w-full text-xs">
                  Zapomněli jste heslo?
                </Button>
              )}
            </form>
          )}

          {!showReset && (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">nebo</span></div>
              </div>

              <Button variant="outline" onClick={handleGoogleSignIn} className="w-full">
                <KeyRound className="mr-2 h-4 w-4" />
                Přihlásit přes Google
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                {isSignUp ? "Máte účet?" : "Nemáte účet?"}{" "}
                <button onClick={() => setIsSignUp(!isSignUp)} className="text-primary hover:underline font-medium">
                  {isSignUp ? "Přihlásit se" : "Registrovat"}
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;
