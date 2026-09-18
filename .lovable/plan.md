# Vrstvení ekonomiky: uzly = kapacita, zboží = skutečná produkce

Cíl: dokončit hierarchii, kterou jsi popsal. Uzly přestanou být druhá ekonomika a stanou se
horní vrstvou (potenciál/kapacita). Zboží a trh zůstanou jediným místem, kde se „produkuje“.
Fiskál je až třetí následek. Žádný nový vzorec HDP v tomto passu.

```text
VRSTVA A  geografie, biom, uzly, silnice, stabilita
          -> produkční potenciál / obchodní (distribuční) kapacita
VRSTVA B  potenciál + pracovní síla + recepty + zakázky
          -> konkrétní zboží -> spotřeba / deficit / přebytek -> obchod -> tržní hodnota
VRSTVA C  daňové základy -> fiskální příjem -> pokladna
```

## Co se změní

### 1. Slovník a role (dokumentace + komentáře v DB)
- `production_output` = **produkční potenciál** uzlu, `wealth_output` = **obchodní
  (distribuční) kapacita**. Doplním `COMMENT ON COLUMN` k oběma sloupcům a sekci
  „Layer A vs Layer B“ do `docs/architecture/economy-contract.md`.
- Fyzické přejmenování sloupců teď nedělám (zasahuje ~30 souborů a edge funkcí);
  jmenná migrace může být samostatný pass, pokud ji budeš chtít.

### 2. Souhrny říše přestanou míchat vrstvy
- `aggregate-realm-totals` bude psát dvě jasně pojmenované kapacity:
  `total_production_capacity` (Σ production_output) a `total_commercial_capacity`
  (Σ wealth_output) — nové sloupce, výchozí 0.
- `total_production` zůstane jen pro zpětnou kompatibilitu se stejnou hodnotou jako
  kapacita a označím ho v dokumentaci jako deprecated.
- `total_gdp` (proxy) se přestane opírat o výkon uzlů a bude vycházet ze zboží:
  `goods_production_value + export_gross_value`. TODO na value-added zůstává.

### 3. Potenciál se začne chovat jako kapacita, ne jako násobek
- V `compute-trade-flows` dnes potenciál uzlu jen škáluje výstup (faktor 0.5–1.5).
  Přidám skutečný strop: realizovaná produkce uzlu nepřekročí jeho produkční potenciál
  (převod v jednotné škále + hlášení `capacity_bound` v odpovědi pro diagnostiku).
- Zakázky a pracovní síla zůstávají beze změny.

### 4. UI: jeden řetězec místo dvou soupeřících čísel
`ProductionOverviewCard` přepíšu na řetězec:
```text
Produkční potenciál  ->  Realizovaná produkce  ->  Tržní hodnota  ->  Fiskální příjem z goods
```
s obchodní/distribuční kapacitou jako vedlejším údajem. Zároveň opravím chybu: karta dnes
zobrazuje „Σ node wealth“ z `total_wealth`, což je dnes alias fiskálního příjmu, ne uzly.
Stejný slovník projdu i v `NodeFlowBreakdown`, `ResourceHUD` a `EconomyDebugTab`.

### 5. Testy a ověření
- Rozšířím `src/test/economy-integrity.test.ts`: vrstvy se nesmí míchat (HDP proxy nečte
  výkon uzlů; karta produkce nečte `total_wealth`), kapacitní strop existuje.
- Ověřím dvojitým přepočtem na živé session, že stav zůstává identický (idempotence).

## Co se nemění
Fiskální kontrakt (process-turn jediný writer turnového fiskálu), pravidla snapshotů a
historie, pět daňových základů, balancing čísel, `fiscal_capture` zůstává telemetrií.
