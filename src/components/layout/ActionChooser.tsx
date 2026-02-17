import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Building2, Swords, Feather, Sparkles, MessageSquare } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onAction: (action: string) => void;
}

const ACTIONS = [
  { id: "city_action", label: "Akce města", desc: "Stavba / upgrade / produkce", icon: Building2 },
  { id: "battle", label: "Bitva", desc: "Vyhlásit útok nebo obranu", icon: Swords },
  { id: "diplomacy", label: "Diplomacie", desc: "Smlouva, aliance, embargo", icon: Feather },
  { id: "event", label: "Událost", desc: "Normální / památná / legendární", icon: Sparkles },
  { id: "comment", label: "Poznámka", desc: "Osobní komentář / anotace", icon: MessageSquare },
];

const ActionChooser = ({ open, onClose, onAction }: Props) => {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Přidat akci</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {ACTIONS.map(a => {
            const Icon = a.icon;
            return (
              <button
                key={a.id}
                onClick={() => { onAction(a.id); onClose(); }}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-left"
              >
                <Icon className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <p className="font-display font-semibold text-sm">{a.label}</p>
                  <p className="text-xs text-muted-foreground">{a.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ActionChooser;
