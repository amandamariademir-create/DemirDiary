# 🌸 DemirDiary

En personlig hälsodagbok för att följa menscykel och mående dag för dag.

## Funktioner

- **Månadskalender** där mensdagar och ägglossning färgas och humöret visas som en emoji.
- **Dagsformulär** där du markerar mens eller ägglossning och fyller i humör, energi, sömn (timmar och antal uppvaknanden) och en fri anteckning.
- **Översikt** med cykeldag, snittlängd på cykel och mens, och uppskattning av nästa mens och ägglossning. Kommande mensdagar och ägglossning markeras med streckad ram i kalendern.
- **Säkerhetskopia**: exportera och importera dina uppgifter som en JSON-fil.

## Var sparas uppgifterna?

Allt sparas lokalt i webbläsaren (`localStorage`) på enheten du använder. Inget skickas till någon server.
Det betyder att uppgifterna inte syns på andra enheter och kan försvinna om du rensar webbläsardata. Exportera därför en säkerhetskopia ibland.

## Köra sidan

Det behövs inget byggsteg. Öppna `index.html` i webbläsaren, eller starta en enkel lokal server:

```sh
python3 -m http.server 8000
```

och gå till http://localhost:8000.

## Publicera med GitHub Pages

1. Gå till repots **Settings → Pages**.
2. Välj **Deploy from a branch**, välj branchen och mappen `/ (root)`.
3. Spara. Sidan blir tillgänglig på `https://<användarnamn>.github.io/DemirDiary/`.

Koden blir publik men dina uppgifter stannar i din egen webbläsare.

## Installera som app

När sidan är publicerad (till exempel med GitHub Pages) kan den läggas på hemskärmen och fungerar då utan internet.

- **iPhone:** öppna adressen i Safari och tryck på *Dela → Lägg till på hemskärmen*.
- **Android:** öppna adressen i Chrome och tryck på *⋮ → Installera app*.

Appen på hemskärmen har sin egen lagring. Har du redan fyllt i uppgifter i webbläsaren: tryck på **Exportera** där och sedan **Importera** i appen.

När du ändrar i koden, höj versionen i `CACHE` i `sw.js` (till exempel `demirdiary-v2`) så att gamla sparade filer rensas.

## Hur uppskattningen fungerar

- Mensdagar med högst en dags uppehåll räknas som samma mens.
- Cykellängden är antalet dagar mellan två mensstarter. Snittet räknas på de senaste sex cyklerna.
- Innan det finns två registrerade menstillfällen antas en cykel på 28 dagar.
- Ägglossningen uppskattas till 14 dagar före nästa väntade mens. Har du själv markerat ägglossning inom fem dagar från den dagen visas ingen uppskattning för den cykeln.

Uppskattningen är inte ett medicinskt råd och ska inte användas som preventivmedel.
