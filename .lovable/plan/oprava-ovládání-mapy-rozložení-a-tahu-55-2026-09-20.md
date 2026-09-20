# Oprava ovládání mapy, rozložení a tahu 55

## Výsledek
- Kliknutí na libovolnou horní záložku vždy zavře detail políčka, subčtverce i režim stavby a otevře požadovanou část.
- Běžné části hry se na počítači otevřou přes celou dostupnou šířku; mapa zůstane pod nimi. Kontextový detail mapy zůstane užší pouze při práci přímo s mapou.
- Horní pruh světa a řádek surovin budou výrazně nižší a úspornější, bez ztráty ovládacích prvků.
- Test01 půjde bezpečně uzavřít z tahu 55 a ekonomika zůstane na kanonických fyzických tocích.

## Postup
1. **Ovládání záložek a detailů mapy**
   - Sjednotit změnu horní záložky do jednoho handleru.
   - Při změně záložky zavřít mapový detail a zrušit lokální výběr/režim stavby, aby překryv mapy nemohl skrýt otevřený obsah.
   - Zachovat návrat na mapu a opětovné otevření detailu kliknutím.

2. **Šířka pracovního prostoru**
   - Změnit modulové záložky z pravého 40% panelu na plnou šířku dostupné obrazovky.
   - Úzký pravý panel ponechat jen pro detail mapového objektu a stavění.
   - Zachovat samostatné rolování obsahu a ovladatelnost mapy v mapovém režimu.

3. **Kompaktní horní část**
   - Zmenšit výšku názvu světa, roku, tlačítka tahu a uživatelských ikon.
   - Suroviny převést na tenčí jednořádkový přehled s menšími štítky; podrobnosti zůstanou v nápovědě a rozbalovacím přehledu.

4. **Test01: tah 55**
   - Zjistit konkrétní neúspěšnou fázi a stav zámku uzávěrky.
   - Opravit životní cyklus zámku tak, aby po chybě nezůstal svět trvale ve stavu „zpracování běží“, včetně bezpečného převzetí prokazatelně zastaralého pokusu.
   - Opravit původní chybu pipeline, ne obcházet ji ručním posunem tahu.

5. **Ekonomická kontrola Test01**
   - Bez posunu tahu spustit kanonický refresh dvakrát.
   - Porovnat výrobní uzly, kapacitu, goods produkci, poptávku, fyzické i košové toky, osiřelé odkazy a fiskální hodnoty.
   - Ověřit, že oba refreshy vrátí stejný stav a nemění zlato, daně, historii ani číslo tahu.

6. **Ověření uzávěrky a obrazovky**
   - Spustit skutečnou uzávěrku tahu 55 až po úspěšné kontrole pipeline.
   - Ověřit, že tah přejde právě na 56, historie vznikne nejvýše jednou a ekonomický stav je označen jako dokončený.
   - Prověřit záložky, mapový detail a kompaktní horní pruh na aktuální desktopové velikosti i menším displeji.

## Technické pojistky
- Žádná fallback produkce při nulové kapacitě.
- Refresh zůstane čistý derived recompute bez fiskálních zápisů a historie.
- `commit-turn` zůstane jediným místem pro turnový fiskál a snapshot po úspěchu celé pipeline.
- Městská a uzlová ID v obchodních tocích zůstanou ve správných sloupcích.
