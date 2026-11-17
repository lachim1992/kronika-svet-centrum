# Chronicle — uzavření ekonomiky před mikroekonomickou vrstvou

**Stav:** návrh a implementační kontrakt; dosud **NEIMPLEMENTOVÁNO** jako nový engine. Vlastníkem běhu je canonical Goods solver. Tato specifikace neuděluje souhlas k produkčním migracím ani k posunu TEST02.

## 0. Pořadí a podmínky přechodu

### Gate A — dokončit to, co již existuje (P0)

1. Všechny fyzické receptury a řetězce: 39 goods / 50 recipes / 30 buildings podle katalogu. Izolované supplier-chain fixture + jednotný propojený svět. Pro každý obchod A-material/industrial input doložit planned, delivered, used, unmet, source, landed cost a blocker. Nepředpokládat, že propojená mapa zaručuje dostupnost: kapacita, cena, vzdálenost a rezervace mohou dodávku oprávněně zablokovat. Test má rozlišit *neproveditelnou fixture* od chyby.
2. Základní potřeby, zásobování, práce, C-palivo, B-trvanlivé nástroje, mlýn a pečení; žádné zboží zdarma ani dvojí produkce. Žádné zdroje mimo canonical ledger.
3. Příjmové propojení: localWage → producer payroll → wageSettlement (převod producent→domácnost bez fiskálu) → následující committed turn household disposable income → discretionary budget. Ověřit soulad peněžních jednotek, mzdy skutečně vyplacené vs. imputované, podnikové zůstatky, nedoplatky, ownership payouts.
4. Export je prodej/transfer a monetární/fiskální událost, nikdy další produkce ani druhé GDP. Goods VA + trade service VA = GDP. Treasury writer pouze process-turn; refresh bez fiskálního účinku. Žádná dodatečná daň ze samotného zobrazení toku.
5. UI Economy/Dev načítá stejnou verzi committed výsledků; chybějící stav ukáže jako neověřený, nikoliv přepsanou nulu. TEST02 pouze read-only nebo invariantně bezpečný derived-only refresh.
6. Testy: jednotkové + souhrnné; fyzická bilance, idempotence, determinismus; 20/200 kroků *syntetické fyzické* simulace označit přesně tímto názvem; samostatný 30-turn disposable E2E, pokud je dostupný, bez placených AI volání. Ověřit jestli všechny cenové/mzdové/peněžní zpětné vazby opravdu prochází přes committed tah.
7. Před zahájením Gate B evidovat audit souborů/změn, test pass/fail, SHA, deployment stav, neověřené LIVE TEST02 a zbývající P0/P1. Neukrývat chyby přes další abstrakce.

### Gate B — peněžní mikroekonomie (až po Gate A)

**Zakázáno:** zavést druhý paralelní price/production solver, připsat hotovost z účetní valuace neprodaného zboží, odčítat stejný náklad dvakrát, vytvořit soukromý příjem bez peněžní protistrany.

1. **Ekonomický subjekt.** Identifikátor každého existujícího producenta; jeho vlastník, lokalita, výrobní receptura, fixní kapacita, zaměstnanci, vstupní zásoby, disponibilní hotovost, závazky. Nejprve design migrace city producer cash; zatím nepředstírat existující soukromé firma-ledgery.
2. **Nákladová nabídka.** Ex ante rozhodnutí používá committed ceny t−1, očekávané landed ceny inputů, plánované množství, spotřebu faktoru B, palivo C, local wage, dostupnou práci, kapitál. Výrobce zvažuje dosažitelnost inputů, capacity, expected contribution margin, případně bounded emergency/strategic production. Očekávaná marže != realizovaný zisk.
3. **Volba kupujícího.** Domácnosti poptávají dle existujících funkčních košů, preference/utility, náhrad, lokálních cen a *financovaných* rozpočtů; provozy poptávají skutečné BOM inputy, pokud mají prostředky; stát z explicitního fiskálního rozpočtu. Nutnou nefinancovanou potřebu vykazovat jako unmet/affordability shortage. Nesmí vznikat nákup bez plátce.
4. **Market clearing.** V každém tahu deterministicky párovat nabídky dosažitelných producentů s poptávkou přes landed delivered prices (transport, toll, tariff, losses, capacities, war). Stable tie-break, monotonic inventory debits, no overselling, receipts/payments reconciled. Posted ask není automaticky transakční cena. Oddělit offer, accepted quantity, settled price a unsold stock. Nerealizované nabídky nejsou GDP ani výnosy.
5. **Výsledek firmy.** Realized revenue − actual intermediate costs = VA (pozor na metodiku cenového základu a odlišný HDP). Operating surplus = VA − actual payroll − další provozní služby/náklady; cash delta = cash receipts − cash outflows; taxes/state transfers mají protistranu; depreciation je ekonomický náklad, není další automatický cash odtok. Zisk/mark-up/rentabilita mají jasné jmenovatele, nesměšovat producer surplus, accounting profit, cash balance a city capital stock.
6. **Zpětná vazba.** Až committed t určuje ceny/poptávku a reálnou hotovost pro t+1. Investice/expanze/upadání pouze z realizovaného kapitálu nebo explicitně financovaného úvěru; během t se solver nesmí zacyklit cena↔poptávka.
7. **Kompatibilita.** Stávající fyzický ledger, province/city build commands, refresh/commit guards, AI a UI contracts zůstávají autoritativní. Plánovaný dual-run comparison bez rozdílů ve fyzické konzervaci a bez přepnutí live světa.

### Gate C — endogenní tržní struktury (až po Gate B)

- **Relevantní trh** vzniká kombinací zastupitelnosti statků a dosažitelnosti dodavatelů pro kupujícího. Hranice trhu nejsou administrativní city hranice. Město s jedním lokálním výrobcem nemusí být monopol, pokud může dovážet.
- **Koncentrace** vychází z vlastnictví a skutečně realizovaných podílů; lze měřit HHI. HHI samo neurčuje marži; tržní sílu omezují elasticita, substituty, potenciální vstup a obchodní bariéry.
- **Strategie producentů**: rozšíření, ukončení výroby, případně cenový markup podle omezeného očekávání a konkurence. První iterace bez agentního řešení Cournot/Bertrand pro každou firmu. Monopol/oligopol nejsou hardcoded přepínače.
- **Zásahy hráče**: clo, licence, výhradní právo, cenové stropy/podlahy, státní nákup/produkce a obchodní infrastruktura. Každý command prochází validací a má náklad a identifikovatelné vítěze/poražené. Žádný beznákladový bonus.
- **Reakce** na přerušení trasy, embargo, nový konkurenční důl nebo růst mezd musí vycházet z cen, kapacit a transakcí, nikoliv z jednorázových scripted eventů.

## Akceptační scénáře Gate B/C (budoucí testy)

- Konkurent otevře levnější dodávku: změna směrování obchodních toků, realizovaných podílů a marží; žádný export bez odběratele.
- Izolovaný monopol: schopnost zvýšit ask neimplikuje garantovaný prodej. Po zpřístupnění importu se tržní síla zmenší.
- Zdražení železa: vyšší jednotkový náklad na meče; prodejní cena se může změnit, ale není povinně cost-plus, marže může klesnout, nabídka na t+1 reaguje.
- Nedostatek pracovníků: local wage stoupne, výplaty omezí producer cash; household disposable reaguje v následujícím tahu; žádná skrytá tvorba peněz.
- Válka přeruší jedinou cestu: nulová dodávka a transparentní blocker, žádná teleportace zboží.
- 30-turn disposable E2E: každá fyzická, rozpočtová a peněžní bilance souhlasí; repeat refresh není fiscal writer; po 200 modelových turnech nejsou NaN, runaway cash, záporné zásoby, artefakty pořadí city IDs.

## Požadovaný výstup implementace

Pro každou fázi: konkrétní změněné soubory, doložený failure před fixem, regresní test a jeho běh, limitace, deployed commit SHA nebo explicitně „not deployed“. Gate B/C se nezačne bez písemného Gate A reportu.
