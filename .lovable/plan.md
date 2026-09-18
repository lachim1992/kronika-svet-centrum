# Oprava produkčního řetězce a stavební zásoby

## Cíl

Sjednotit zobrazený potenciál se skutečnými uzly, zajistit okamžitý účinek dokončených specializovaných dvorů a obnovovat stavební zásobu pouze ze skutečně dostupných stavebních materiálů.

## Postup

1. Opravit kapacitní pravidlo receptů: uzel s nulovým `production_output` dostane nulový throughput; žádný fallback z nuly na implicitní kapacitu.
2. Přesunout dokončení budov a čtvrtí před ekonomickou pipeline uzávěrky tahu, aby jejich `basket_outputs` vstoupily do stejného tahu.
3. Opravit kotvení hráčských subuzlů: produkční uzel musí mít `city_id` nebo platného rodiče; jinak se stavba odmítne místo vzniku osiřelé produkce.
4. Obnovovat `production_reserve` v `process-turn` z post-trade `construction.local_supply` v poměru 1:1. Kapacita uzlů se na zásobu nepřevádí a jednorázové odečty ve stavbách a silnicích zůstávají beze změny.
5. Upravit panel produkce, aby nesrovnával peněžní hodnotu produkce s throughput sloty procentem, a zpřesnit popisky GDP bez exportu.
6. Přidat kontraktové testy a ověřit na živém světě: přepočet dvakrát, stejné výsledky; nově dokončený dvůr zvýší správnou složku výroby; historie ani fiskál se při refreshi nezmění.

## Technické pojistky

- `goods_production_value = auto + recipe + structures` zůstává invariant.
- `production_reserve` čte pouze koš `construction`; import je už zahrnut v `local_supply` a nepřičítá se podruhé.
- `refresh-economy` zůstává čistý derived přepočet a stavební zásobu nemění.
- Přírůstek stavební zásoby proběhne nejvýše jednou za úspěšně zpracovaný tah.
- Žádné nové sazby, balancing ani alternativní převod z Layer A kapacity.