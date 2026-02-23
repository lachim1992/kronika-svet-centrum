import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import ChronicleHubLogo from "@/components/ChronicleHubLogo";

const Welcome = () => {
  const navigate = useNavigate();

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background:
          "linear-gradient(180deg, hsl(220 30% 5%) 0%, hsl(220 30% 10%) 40%, hsl(220 25% 7%) 100%)",
      }}
    >
      {/* Main content – vertically centered */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-2xl w-full space-y-10 animate-fade-in">
          {/* Logo */}
          <div className="text-center">
            <ChronicleHubLogo variant="full" size="hero" />
          </div>

          {/* Heading */}
          <h1
            className="text-center text-xl md:text-2xl font-semibold text-primary tracking-wide leading-relaxed"
            style={{ fontFamily: "'Cinzel', serif" }}
          >
            Vítejte v The Chronicle Hub.
          </h1>

          {/* Quote */}
          <blockquote className="text-center text-base md:text-lg italic text-primary/70 leading-relaxed px-4">
            „Každá myšlenka, kterou ve světě vyslovíte, se může stát událostí.
            A každá událost může změnit dějiny."
          </blockquote>

          {/* Body prose */}
          <div
            className="prose-chronicle space-y-5 text-sm md:text-base text-muted-foreground/90 leading-[1.85] px-2"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            <p>
              The Chronicle Hub je projekt, jehož cílem je vytvořit simulátor
              vzniku civilizace od prvních osad až po vznik říší, konfederací a
              historických mocností. Nejde o klasickou strategii zaměřenou pouze
              na dobývání mapy ani o předem napsaný příběh. Cílem je vybudovat
              svět, který reaguje na vaše rozhodnutí a dokáže si je pamatovat.
            </p>

            <p>
              V této podobě je Chronicle stále ve vývoji. Mnohé systémy jsou
              teprve budovány a laděny. Ne všechny mechaniky jsou plně funkční a
              některé části světa zatím slouží jako kostra budoucí simulace.
              Tento projekt je experimentem i dlouhodobou vizí: vytvořit prostor,
              kde můžete začít jako malá osada a postupně získávat vliv
              ekonomicky, vojensky i diplomaticky.
            </p>

            <p>
              V budoucnu by Chronicle mělo umožnit, aby každé vaše rozhodnutí –
              ať už formulujete nový zákon, sepíšete diplomatickou deklaraci,
              poradíte se s radou, nebo jednoduše vyjádříte svůj záměr vlastním
              jazykem – mělo skutečné důsledky. Nejde jen o výběr z nabídky
              možností, ale o prostor, kde můžete definovat směr svého národa
              sami. Herní engine bude analyzovat vaše kroky, interpretovat jejich
              podstatu a přepočítávat jejich dopad na stabilitu, vztahy, obchod,
              napětí i reputaci. Umělá inteligence nebude nahrazovat logiku
              světa, ale zprostředkovávat jeho reakce – vytvářet kroniky, zprávy
              a postoje aktérů, kteří v něm žijí. Každá myšlenka, kterou ve
              světě vyslovíte, se může stát událostí. A každá událost může
              změnit dějiny.
            </p>

            <p>
              Základní myšlenka je jednoduchá: svět nemá být statický. Města
              mají růst nebo upadat. Aliance mají vznikat i bez přímého zásahu
              hráče. Konflikty mají mít své příčiny a paměť. Pokud dojde ke
              zradě, svět si ji zapamatuje. Pokud vznikne významná dohoda, může
              ovlivnit rovnováhu sil na dlouhá období. Cílem není jen obsazovat
              území, ale vytvářet celek, který obstojí v čase a zanechá stopu v
              dějinách světa.
            </p>

            <p>
              Chronicle má být místem, kde můžete formulovat vlastní zákony,
              vyjednávat podmínky, budovat pevnosti na strategických místech,
              řídit obchodní vazby, ovlivňovat náladu měst a reagovat na hrozby,
              které vznikají postupně. Každý svět má být unikátní a každá hra má
              vytvářet vlastní historii, která nebude předem napsaná.
            </p>

            <p>
              Projekt stojí na myšlence personalizovaného světa, kde hráč není
              omezen na několik předdefinovaných možností, ale může formulovat
              své kroky vlastním jazykem. Engine bude tyto kroky strukturovat a
              vyvozovat z nich systémové důsledky. Umělá inteligence pak
              poskytne interpretaci a kontext – kroniky, zprávy, poradní
              stanoviska – ale skutečný vývoj bude vycházet z vnitřní logiky
              světa.
            </p>

            <p>
              The Chronicle Hub je tedy spíše vznikající platformou než hotovou
              hrou. Je to prostor, kde se testuje, jak může vypadat simulace
              počátků civilizace postavená na paměti, vlivu a dlouhodobých
              důsledcích. Cílem není rychlé vítězství, ale možnost budovat něco,
              co bude v rámci daného světa přetrvávat a dávat smysl i po mnoha
              kolech.
            </p>

            <p className="text-primary/60 italic text-center pt-2">
              Tento svět je teprve na začátku. Stejně jako každá civilizace.
            </p>
          </div>
        </div>
      </div>

      {/* Sticky bottom CTA */}
      <div className="sticky bottom-0 w-full py-6 px-6 flex justify-end backdrop-blur-md bg-background/40 border-t border-border/40">
        <Button
          size="lg"
          onClick={() => navigate("/games")}
          className="font-display text-base tracking-wide gap-2 px-8"
        >
          Přejít na moje světy
          <ArrowRight className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
};

export default Welcome;
