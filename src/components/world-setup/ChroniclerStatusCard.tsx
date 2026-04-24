import { useEffect, useMemo, useState } from "react";
import { ScrollText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BootstrapStepRecord } from "@/types/worldBootstrap";
import { CANONICAL_BOOTSTRAP_STEPS } from "./BootstrapProgressPanel";

// ─────────────────────────────────────────────────────────────────────────────
// Středověký kronikář — rotující hlášky pro každou fázi inicializace světa.
// Hlášky se losují náhodně z 3–5 variant a rotují každých ~2.8 s.
// ─────────────────────────────────────────────────────────────────────────────

const STEP_QUOTES: Record<string, string[]> = {
  "validate-normalize": [
    "Pisaři ostří brka a kontrolují pečetě na zakládací listině…",
    "Mistr písař proklepává pergamen, zda nepraskne pod tíhou stvoření…",
    "Notář ověřuje, že královský záměr není psán nedopatřením latinou kuchyňskou…",
    "Inkoust se mísí s popelem fénixe — formuláře musí souhlasit.",
  ],
  "world-foundations": [
    "Bohové kladou první kámen základní — a hádají se, zda má být kulatý či hranatý…",
    "Země se probouzí ze sna a protahuje hřbet svých hor…",
    "Démiurgové měří hloubku oceánů na sáhy a lokte zlatým kružítkem…",
    "Z prvotního chaosu se odděluje světlo, tma a několik nedopatření…",
  ],
  "server-config": [
    "Královský komorník svolává herold y, posly a holuby poštovní…",
    "Ve sklepení se rozněcují signální ohně mezi věžemi všech kontinentů…",
    "Cech mlynářů nastavuje rychlost větru, aby se kola otáčela správně…",
  ],
  "persist-worldgen-spec": [
    "Mniši opisují kroniku stvoření do trojí kopie — pro krále, pro klášter, pro potomky…",
    "Archivář pečetí svitky voskem barvy půlnoční oblohy…",
    "Ve velké knize osudu zaschla kapka inkoustu přesně tam, kde mělo stát tvé jméno…",
    "Knihovník brblá, že už zase přibývají nové svazky.",
  ],
  "generate-world-map": [
    "Kartografové brodí močály a značí každý ostrůvek lišejníku…",
    "Mistr Tomáš z Mappa Mundi rýsuje hřebeny hor podle stínu draků…",
    "Geometr napřahuje řetěz v sázích a měří, kde končí svět a začíná ráj…",
    "Z mlh se vynořují pobřeží — některá jsou tam, kde mají být.",
    "Větve řek hledají moře jako poutníci hostinec za soumraku…",
  ],
  "placement-artifacts": [
    "Heroldi roztrubují, kde rody postaví své první ohně…",
    "Královský zeměměřič zatlouká kolíky do panenské země — kov drnčí slavnostně…",
    "Praotcové vystupují z mlh a hledají kopec hodný své pýchy…",
    "Na obzoru se zjevují znamení: zde stane brána, tady stůl, onde meč.",
  ],
  "mode-specific-seeding": [
    "Sedláci orají první brázdu, kněží žehnají semenu, kovář zatím nezná své jméno…",
    "Cech zedníků se hádá o cenu cihel ještě před položením základů…",
    "Vesničané přicházejí po jednom — někteří přivádějí kozu, jiní jen špatnou náladu…",
    "Z hlíny se rodí osada, ze slov se rodí zákon, z obojího pak daně…",
    "Kronikář si namáčí brk: „Léta Páně prvního vznikla říše tato…“",
  ],
  "finalize-world-ready": [
    "Královská pečeť dopadá na pergamen — svět je hotov a smí být obýván…",
    "Zvony všech kostelíků světa zvoní současně, pak se rozhodnou pokračovat…",
    "Bohové ustupují o krok zpět, mhouří oči a kývají hlavou: bude to stačit.",
    "Hvězdy se ujistí, že jsou na svých místech, a začínají blikat dle libosti.",
  ],
};

const NARRATIVE_QUOTES = [
  "Mniši v skriptoriu obracejí list a chystají se zapsat tvou první kapitolu…",
  "Bardy ladí struny, neboť o tvé říši se bude zpívat ještě před první bitvou…",
  "Kronikář maluje iniciálu zlatem — tvé jméno bude první v knize věků…",
  "Ve věži alchymistů se destiluje pověst tvé říše do prvních pověr…",
];

interface ChroniclerStatusCardProps {
  receivedSteps?: BootstrapStepRecord[];
  activeIndex?: number;
  bootstrapError?: string | null;
  /** Když je true, zobrazí se hlášení o pokračující narativní fázi (AI lore na pozadí). */
  narrativeStreaming?: boolean;
}

function pickQuote(key: string, tick: number): string {
  const pool = STEP_QUOTES[key] ?? ["Kronikář mlčky pozoruje stvoření…"];
  return pool[tick % pool.length];
}

export const ChroniclerStatusCard = ({
  receivedSteps,
  activeIndex,
  bootstrapError,
  narrativeStreaming,
}: ChroniclerStatusCardProps) => {
  const [tick, setTick] = useState(() => Math.floor(Math.random() * 100));

  // Rotace hlášek
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2800);
    return () => clearInterval(id);
  }, []);

  const totalSteps = CANONICAL_BOOTSTRAP_STEPS.length;
  const completedCount = receivedSteps?.filter((s) => s.ok).length ?? 0;

  const currentStepKey = useMemo(() => {
    if (bootstrapError) return null;
    if (activeIndex !== undefined && activeIndex < totalSteps) {
      return CANONICAL_BOOTSTRAP_STEPS[activeIndex]?.key ?? null;
    }
    // Po dokončení fyzického světa, ale ještě běží narativ
    return null;
  }, [activeIndex, bootstrapError, totalSteps]);

  const headline = useMemo(() => {
    if (bootstrapError) return "Kronikář upustil brk — ozvi se písaři.";
    if (currentStepKey) {
      return CANONICAL_BOOTSTRAP_STEPS.find((s) => s.key === currentStepKey)?.label
        ?? "Stvoření probíhá…";
    }
    if (narrativeStreaming) return "Narativ se rodí…";
    return "Kronika čeká na první řádek.";
  }, [bootstrapError, currentStepKey, narrativeStreaming]);

  const quote = useMemo(() => {
    if (bootstrapError) {
      return "Inkoust vsákl, pergamen se zkroutil. Snad nebude třeba začínat znovu od potopy…";
    }
    if (currentStepKey) return pickQuote(currentStepKey, tick);
    if (narrativeStreaming) return NARRATIVE_QUOTES[tick % NARRATIVE_QUOTES.length];
    return "Mistr písař si rovná pergameny a čeká na pokyn.";
  }, [bootstrapError, currentStepKey, narrativeStreaming, tick]);

  const progressPct = bootstrapError
    ? 100
    : Math.min(100, Math.round((completedCount / totalSteps) * 100));

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-amber-900/30 bg-gradient-to-b from-amber-50/60 to-amber-100/40 dark:from-amber-950/20 dark:to-amber-900/10 p-5 shadow-inner",
      )}
    >
      {/* dekorativní rohové ornamenty */}
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_top_left,hsl(var(--primary)/0.15),transparent_40%),radial-gradient(circle_at_bottom_right,hsl(var(--primary)/0.1),transparent_40%)]" />

      <div className="relative flex items-start gap-3">
        <div className="mt-0.5 rounded-full bg-amber-900/10 dark:bg-amber-100/10 p-2">
          {bootstrapError ? (
            <ScrollText className="h-5 w-5 text-destructive" />
          ) : (
            <Loader2 className="h-5 w-5 text-amber-700 dark:text-amber-300 animate-spin" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-[0.2em] text-amber-800/80 dark:text-amber-200/70 font-semibold">
            Kronikář praví
          </div>
          <div className="mt-1 font-serif text-base font-semibold text-amber-950 dark:text-amber-100">
            {headline}
          </div>

          <div
            key={quote}
            className="mt-2 font-serif italic text-sm text-amber-900/90 dark:text-amber-100/85 animate-fade-in min-h-[2.5rem]"
          >
            „{quote}"
          </div>

          {/* progress */}
          <div className="mt-4 space-y-1">
            <div className="flex items-center justify-between text-[11px] text-amber-800/70 dark:text-amber-200/70 tabular-nums">
              <span>
                Pečeť {completedCount} z {totalSteps}
              </span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-amber-900/15 dark:bg-amber-100/10">
              <div
                className={cn(
                  "h-full transition-all duration-700 ease-out",
                  bootstrapError
                    ? "bg-destructive"
                    : "bg-gradient-to-r from-amber-600 to-amber-400",
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
