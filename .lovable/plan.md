

## Problém

Komponenta `RealmDashboard` (obsahující `RealmIndicators` a `RealmLawsDecrees`) byla vytvořena, ale **nikdy nebyla importována ani zobrazena** v žádné stránce. `RealmTab.tsx` ji vůbec nepoužívá — zobrazuje jen `TurnProgressionPanel`, Diplomacii, Válku atd.

## Řešení

Přidat `RealmDashboard` jako novou sub-záložku **"Přehled"** (nebo "Říše") do `RealmTab.tsx`, aby byla první a výchozí záložka.

### Změny

**`src/pages/game/RealmTab.tsx`**:
1. Import `RealmDashboard`
2. Přidat nový `TabsTrigger` s ikonou `Crown` jako první záložku (value `"overview"`, defaultValue změnit na `"overview"`)
3. Přidat `TabsContent` renderující `RealmDashboard` s propsy `sessionId`, `currentPlayerName`, `currentTurn`, `myRole`, `cities`, `onRefetch`

Žádné další soubory není potřeba měnit — komponenty `RealmDashboard`, `RealmIndicators` a `RealmLawsDecrees` už existují a jsou funkční.

