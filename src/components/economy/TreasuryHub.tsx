// TreasuryHub — unified fiscal root tab. Single source of treasury total.
// Sub-tabs: Přehled (TreasuryPanel), Daňová politika, Detail příjmů, Výdaje.

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import TreasuryPanel from "./TreasuryPanel";
import TaxPolicySubTab from "./TaxPolicySubTab";
import FiscalSubTab from "./FiscalSubTab";
import MilitaryUpkeepPanel from "./MilitaryUpkeepPanel";
import { Card, CardContent } from "@/components/ui/card";
import { Info } from "lucide-react";
import { getFiscalIncome } from "@/lib/economyFlow";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  realm: any;
  onRefetch?: () => void;
}

const subTrigger =
  "text-[11px] font-display rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm whitespace-nowrap px-2.5";

const TreasuryHub = ({ sessionId, currentPlayerName, realm, onRefetch }: Props) => {
  if (!realm) return null;

  const fi = getFiscalIncome(realm);

  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <ScrollArea className="w-full">
        <TabsList className="inline-flex w-auto min-w-full h-9 bg-muted/20 rounded-xl p-1 gap-1">
          <TabsTrigger value="overview" className={subTrigger}>
            Přehled
          </TabsTrigger>
          <TabsTrigger value="policy" className={subTrigger}>
            Daňová politika
          </TabsTrigger>
          <TabsTrigger value="detail" className={subTrigger}>
            Detail příjmů
          </TabsTrigger>
          <TabsTrigger value="expenses" className={subTrigger}>
            Výdaje
          </TabsTrigger>
        </TabsList>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <TabsContent value="overview" className="space-y-4 animate-fade-in">
        <TreasuryPanel realm={realm} />
        {/* Bilance — single canonical total */}
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Příjem /kolo</span>
              <span className="font-mono font-semibold text-primary">
                +{fi.totalIncome.toFixed(1)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Výdaje /kolo</span>
              <span className="font-mono font-semibold text-destructive">
                −{fi.totalExpenses.toFixed(1)}
              </span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-border/30">
              <span className="text-sm font-semibold">💰 Čistá změna pokladny /kolo</span>
              <span
                className={`text-xl font-bold font-mono ${
                  fi.netChange >= 0 ? "text-primary" : "text-destructive"
                }`}
              >
                {fi.netChange >= 0 ? "+" : ""}
                {fi.netChange.toFixed(1)}
              </span>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="policy" className="space-y-4 animate-fade-in">
        <div className="rounded-lg border border-border/30 bg-muted/20 p-3 flex items-start gap-2 text-[11px] text-muted-foreground">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            Slidery upraví nominální sazby. Skutečný dopad (po Laffer křivce a
            governance modifikátoru) uvidíš příští kolo v záložce <b>Přehled</b>.
          </span>
        </div>
        <TaxPolicySubTab
          realm={realm}
          sessionId={sessionId}
          playerName={currentPlayerName}
          onRefetch={onRefetch}
        />
      </TabsContent>

      <TabsContent value="detail" className="space-y-4 animate-fade-in">
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 flex items-start gap-2 text-[11px]">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-accent" />
          <span>
            Pilířový rozklad téhož příjmu: <b>+{fi.totalIncome.toFixed(1)} / kolo</b> —
            totožné s číslem v Přehledu. Není to druhá agregace.
          </span>
        </div>
        <FiscalSubTab
          realm={realm}
          sessionId={sessionId}
          playerName={currentPlayerName}
          onRefetch={onRefetch}
        />
      </TabsContent>

      <TabsContent value="expenses" className="space-y-4 animate-fade-in">
        <MilitaryUpkeepPanel realm={realm} />
      </TabsContent>
    </Tabs>
  );
};

export default TreasuryHub;
