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
        "radial-gradient(ellipse at 50% 20%, hsl(228 38% 12%) 0%, hsl(228 38% 8%) 50%, hsl(228 40% 5%) 100%)"
      }}>

      {/* Main content – vertically centered */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-2xl w-full space-y-10 animate-fade-in">
          {/* Logo */}
          <div className="flex justify-center">
            <ChronicleHubLogo variant="full" size="hero" className="mx-auto" />
          </div>

          {/* Heading */}
          <h1
            className="text-center text-xl md:text-2xl font-semibold text-primary tracking-wide leading-relaxed"
            style={{ fontFamily: "'Cinzel', serif" }}>

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
            style={{ fontFamily: "'Inter', sans-serif" }}>

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

            <p>V budoucnu by Chronicle mělo umožnit, aby každé vaše rozhodnutí – ať už formulujete nový zákon, sepíšete diplomatickou deklaraci, poradíte se s radou, nebo jednoduše vyjádříte svůj záměr vlastním jazykem – mělo skutečné důsledky. Nejde jen o výběr z nabídky možností, ale o prostor, kde můžete definovat směr svého národa sami. Zároveň však nepůjde pouze o reakci na existující svět. Budete moci vytvářet svůj vlastní svět od samotných základů – definovat jeho geografii, historii, kultury, mýty i mocenské struktury. Můžete zakládat vlastní města a budovat celé impérium, určovat jejich vizuální podobu, vlastnosti, charakter i dlouhodobý vývoj. Každé město může mít svou identitu, architekturu, tradice i ambice. Můžete stavět naprosto custom budovy, unikátní čtvrti, divy světa, chrámy, pevnosti či akademie – nejen jako statické objekty, ale jako živé prvky světa s konkrétními dopady na ekonomiku, stabilitu, kulturu i vztahy s ostatními.  


Svět nebude jen kulisou – bude reagovat, pamatovat si a vyvíjet se. Budete moci zapisovat své činy do dějin, vytvářet nebo upravovat kroniky, reagovat na již existující záznamy a formovat oficiální i neoficiální verze historie. Příběh se nebude generovat náhodně, ale na základě skutečných událostí, předchozích rozhodnutí a historické kontinuity světa. To, co se stalo před desítkami tahů, může ovlivnit to, co se odehraje nyní. Herní engine bude analyzovat vaše kroky, interpretovat jejich podstatu a přepočítávat jejich dopad na stabilitu, vztahy, obchod, napětí i reputaci. Umělá inteligence nebude nahrazovat logiku světa, ale zprostředkovávat jeho reakce – vytvářet kroniky, zprávy, postoje aktérů, mýty i propagandu. Každá myšlenka, kterou ve světě vyslovíte, se může stát událostí. Každá stavba může změnit rovnováhu sil. Každý kulturní krok může přepsat identitu říše. Chronicle tak nebude jen hra o řízení říše, ale nástroj pro tvorbu dějin – prostor, kde tvoříte svět, reagujete na jeho paměť a zároveň jste jeho součástí. A každá událost, kterou vyvoláte, může změnit jeho budoucnost.












            </p>

            <p>







            </p>

            <p>





            </p>

            <p>







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

          {/* Divider */}
          <div className="flex items-center gap-4 px-4">
            <div className="flex-1 h-px bg-border/40" />
            <span className="text-xs text-muted-foreground/50 uppercase tracking-widest font-display">English</span>
            <div className="flex-1 h-px bg-border/40" />
          </div>

          {/* English version */}
          <div className="prose-chronicle space-y-5 text-sm md:text-base text-muted-foreground/90 leading-[1.85] px-2" style={{ fontFamily: "'Inter', sans-serif" }}>

            <blockquote className="text-center text-base md:text-lg italic text-primary/70 leading-relaxed px-4">
              "Every thought you express in this world can become an event. And every event can change history."
            </blockquote>

            <p>
              The Chronicle Hub is a project aimed at creating a simulation of
              the birth of civilization — from the first settlements to the rise
              of empires, confederations, and historic powers. It is not a
              traditional strategy game focused solely on conquering a map, nor
              is it a pre-written story. The goal is to build a world that reacts
              to your decisions and is capable of remembering them.
            </p>

            <p>
              In its current form, Chronicle is still under development. Many
              systems are being built and refined. Not all mechanics are fully
              functional yet, and some parts of the world currently serve as the
              structural framework of a future simulation. This project is both
              an experiment and a long-term vision: to create a space where you
              can begin as a small settlement and gradually gain influence —
              economically, militarily, and diplomatically.
            </p>

            <p>


In the future, Chronicle should allow every decision you make—whether you draft a new law, compose a diplomatic declaration, consult your council, or simply express your intentions in your own words—to carry real consequences. It will not be limited to selecting options from a predefined list, but instead offer a space where you define the direction of your nation yourself.

At the same time, it will not be only about reacting to an existing world. You will be able to create your own world from the very foundations—defining its geography, history, cultures, myths, and power structures. You can found your own cities and build an entire empire, shaping their visual identity, attributes, character, and long-term development. Each city can possess its own architectural style, traditions, ambitions, and internal dynamics.

You will be able to construct fully custom buildings, districts, wonders, fortresses, academies, temples, or entire cultural landmarks—not as static decorations, but as living elements of the world with measurable impact on economy, stability, culture, diplomacy, and power balance. You can shape cultures, define ideologies, influence collective memory, and guide how your civilization perceives itself and others.

The world will not be a backdrop—it will remember, evolve, and respond. You will be able to record your actions into history, create or amend chronicles, react to existing historical entries, and influence both official records and alternative narratives. The story will not be generated randomly, but grounded in historical continuity. Events emerge from prior decisions, accumulated tensions, alliances, and cultural developments. What happened dozens of turns ago may shape what unfolds now.

The game engine will analyze your actions, interpret their intent, and calculate their impact on stability, trade, diplomacy, internal cohesion, reputation, and global tensions. Artificial intelligence will not replace the logic of the world—it will mediate its response. It will generate chronicles, reports, political reactions, myths, propaganda, and the perspectives of the actors who inhabit the world.




            </p>

            <p>








            </p>

            <p>





            </p>

            <p>







            </p>

            <p>
              The Chronicle Hub is therefore more of an emerging platform than a
              finished game. It is a space for exploring what a simulation of
              early civilization could look like — one built on memory,
              influence, and long-term consequences. The goal is not quick
              victory, but the opportunity to build something that endures within
              the world and continues to make sense over many turns.
            </p>

            <p className="text-primary/60 italic text-center pt-2">
              This world is only at its beginning. Just like every civilization once was.
            </p>
          </div>
        </div>
      </div>

      {/* Sticky bottom CTA */}
      <div className="sticky bottom-0 w-full py-6 px-6 flex justify-end backdrop-blur-md bg-background/40 border-t border-border/40">
        <Button size="lg" onClick={() => navigate("/games")} className="font-display text-base tracking-wide gap-2 px-8">

          Přejít na moje světy
          <ArrowRight className="h-5 w-5" />
        </Button>
      </div>
    </div>);

};

export default Welcome;