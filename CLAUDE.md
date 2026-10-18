# CLAUDE.md

Wskazówki dla Claude Code przy pracy w tym repozytorium.

## O projekcie

**DIANA** (*DIagnostyka i ANAliza układów cyfrowych*) – narzędzie edukacyjne (część pracy magisterskiej) do rysowania układów kombinacyjnych i generowania wektorów testowych (ATPG) klasycznym D-Algorytmem dla pojedynczych usterek *stuck-at* (s-a-0 / s-a-1). Wynik to tabela krok po kroku (pobudzenie → propagacja → badanie zgodności) z komentarzami oraz lista punktów decyzyjnych, w których użytkownik może wybrać alternatywną ścieżkę.

Nazwa aplikacji to **DIANA**; „D-Algorytm” oznacza wyłącznie sam algorytm (np. `DAlgorithmEngine`). Repozytorium na GitHubie: `kratagit/diana` (lokalny katalog nadal nazywa się `d-algorytm`).

Kierunek rozwoju (temat pracy): drugi silnik **PODEM** z heurystykami SCOAP – koszty sterowalności `c0`, `c1` i obserwowalności `O` każdej linii – oraz porównanie wydajności D-Algorytmu i PODEM (np. liczba nawrotów w drzewie przeszukiwań) na topologiach ze ścieżkami zbieżnymi i redundancją; do tego zestaw ćwiczeń laboratoryjnych. **Obecnie zajmujemy się wyłącznie D-algorytmem** – PODEM i miary sterowalności/obserwowalności dopiero później.

Język projektu: **polski** (UI, komunikaty silnika, komentarze w kodzie, README).

## Stos i uruchamianie

- Cała aplikacja w czystym JavaScripcie: frontend HTML/CSS/JS + SVG i silnik `web/engine.js`, bez frameworków i bundlera. Okno to [Electron](https://www.electronjs.org/) (`main.js` otwiera `web/index.html`; silnik działa w oknie, bez IPC i serwera). Przejście z Pythona zakończone (silnik i testy w JS, Electron, wydania na Windows, macOS i Linux).
- Node.js 24. Zależności tylko deweloperskie (`electron`, `electron-builder`, dokładne wersje w `package.json` + `package-lock.json`): `npm install` (pierwsze uruchomienie Electrona pobiera jego binaria).
- Uruchomienie: `npm start` (narzędzia deweloperskie dostępne; w wydaniu wyłączone razem z domyślnym menu – `app.isPackaged`).
- Testy: `npm test` (`node --test tests/*.test.js`, ~600 testów, ok. 5 s) – bez Electrona, w samym Node.js.
- Build: `npm run dist` → `node buduj_przyklady.js` + electron-builder dla bieżącego systemu → `dist/`. Konfiguracja w `package.json` (`build`): do aplikacji trafiają tylko `main.js` i `web/`, z języków Chromium tylko `pl` i `en-US`. Paczki: Windows – instalator NSIS one-click bez uprawnień administratora (`diana-X.Y.Z-windows-x64-setup.exe`, build ok. 30 s, start aplikacji ok. 1 s; wersja `portable` startowała 7,5 s, bo rozpakowuje się przy każdym uruchomieniu), macOS – `.dmg` universal (Intel + Apple Silicon, podpis ad-hoc `identity: "-"`, bez notaryzacji), Linux – `AppImage` i `.deb` (x64). Bez `.rpm` i innych formatów. Wersja lokalnie 0.0.0, w wydaniu podawana przez `-c.extraMetadata.version`. Aplikacja nie jest podpisana certyfikatem – instrukcja odblokowania w README.
- CI (`.github/workflows/`): `ci.yml` – `npm test` przy każdym pushu na `main` i pull requeście; `release.yml` – merge PR na `main` z etykietą `patch`/`minor`/`major` → job `wersja` (testy, wersja z etykiety), job `paczki` (macierz `windows-latest`/`macos-latest`/`ubuntu-latest`, electron-builder) i job `wydanie` (GitHub Release `vX.Y.Z` ze wszystkimi paczkami). Wersja istnieje **tylko jako tag** (ostatni tag podbity wg etykiety, start `v1.0.0`) – w kodzie nie ma pliku z wersją; nie tworzyć tagów ręcznie. PR bez etykiety nie tworzy wydania.
- Podgląd w przeglądarce bez Electrona: konfiguracja `web-static` w `.claude/launch.json` (`npx http-server` na `web/`) – działa cała aplikacja razem z silnikiem.

## Struktura

| Plik | Rola |
|---|---|
| `main.js` | Proces główny Electrona: jedno okno z `web/index.html`, w wydaniu bez menu i narzędzi deweloperskich. |
| `web/engine.js` | Klasa `DAlgorithmEngine` – cała logika algorytmu. Zwykły skrypt bez zależności: w oknie klasa globalna, w Node.js `module.exports`. |
| `web/index.html` | Cały frontend w jednym pliku (CSS + JS inline, ~950 linii): edytor schematów, zoom/pan, kable z załamaniami, tabela wyników, panel alternatywnych decyzji, autosave do `localStorage` (`d_algo_save`). Woła `new DAlgorithmEngine(...).run()` w `runAlgo`. Bez `prompt()` (Electron go nie obsługuje) – nazwę zmienia się na schemacie (`ctxRename`). |
| `web/examples.js` | **Generowany** – `const EXAMPLES = {...}`. Nie edytować ręcznie. |
| `buduj_przyklady.js` | Generuje `web/examples.js` ze wszystkich plików `[NUMER].json` w katalogu głównym. Przyciski w menu „Plik” tworzą się w JS z kluczy `EXAMPLES`. Test pilnuje, by `examples.js` był aktualny. |
| `tests/` | `node --test` – opis niżej w „Testy”. |
| `1.json`, `2.json`, `4.json`, `5.json` | Przykładowe układy (format zapisu z UI). |

## Model danych (kontrakt interfejs ↔ silnik)

Układ to słownik `comps` (`id → komponent`):

```json
{ "id": "G3", "type": "AND", "x": 120, "y": 80,
  "inputs": ["X1", "W2"], "waypoints": [[{"x":..,"y":..}], []] }
```

- Typy: `IN` (wejście pierwotne, prefiks `X`), `NODE` (węzeł/rozgałęzienie, prefiks `W`, 1 wejście), bramki `AND OR NAND NOR XOR XNOR` (2 wejścia) i `NOT` (1 wejście), prefiks `G`. Interfejs tworzy bramki 2-wejściowe; silnik obsługuje dowolną liczbę wejść (`inputs` o długości n).
- `inputs[i]` to `id` komponentu źródłowego lub `null`. Nie ma jawnych wyjść pierwotnych – kierunek propagacji wynika z tego, kto kogo zasila.
- Plik zapisu: `{ components, counter, target, fault_type }` (+ `choices` w `localStorage`).
- Wartości sygnałów w silniku: `'0'`, `'1'`, `'x'`, `'D'` (zdatny 1 / błędny 0), `'~D'` (zdatny 0 / błędny 1); w `delta` może pojawić się `'ERR'` (UI rysuje ❌).
- Wynik `run()`: `{ cols, steps: [{ s, delta, msg, full }], decision_log: [{ id, title, options: [{label, data}], selected }] }`. `full=True` → wiersz pokazuje cały stan, inaczej tylko `delta`.

## Jak działa silnik (`web/engine.js`)

Tabela ma być **prosta dla studenta**: każdy wiersz to jeden krok metody (pobudzenie, propagacja przez bramkę, badanie zgodności) i pokazuje wartości ustalone w tym kroku – bez żadnych dodatkowych „implikacji” ani dopisków. Przykłady z materiałów nie muszą być odtwarzane 1:1 (str. 41 ma 3-wejściowy OR, którego interfejs nie ma). Wartości nigdy się nie zmieniają (tylko `x` → wartość). Zgodność sprawdzana jest w D-algebrze (`dEval`: para układ zdatny / z usterką, `x` = dowolna z 0, 1, D, ~D).

1. **Pobudzenie** – na `target_node` wpisywane `D` (sa0) lub `~D` (sa1); wejścia bramki z `requirementOptions` (pierwotne D-sześciany, Tabela 3).
2. **Propagacja** – dopóki błąd nie dotrze do wyjścia, użytkownik wybiera bramkę z D-granicy (bramki z D/~D na wejściu i nieustalonym wyjściem): decyzja `branch_<bramki>` „Propagacja błędu. Wybierz drogę:”, opcje „Przez G3 (NOR)”. Najpierw (domyślnie) bramki zasilane przez ostatnią bramkę, przez którą przeszedł błąd, potem pozostałe wg numerów. Pozostałe wejścia dostają wartość nie-kontrolującą (AND/NAND 1, OR/NOR 0, XOR/XNOR wybór `prop_<bramka>`), wyjście z D-algebry; wejście z D z innej gałęzi zostaje (D AND D = D). Kilka ścieżek naraz (str. 42) = wybieranie kolejnych bramek z D-granicy przed dojściem do wyjścia. Wyjście bez D → „SPRZECZNOŚĆ (Blokada propagacji)”, pusta D-granica → „SPRZECZNOŚĆ … pusta D-granica”. Każda bramka ma wiersz „Propagacja błędu przez …” z wartościami jej pozostałych wejść, a zaraz po pobudzeniu `insertPathRow` wstawia wiersz „Wybór ścieżki propagacji (…)” z wybranymi bramkami po kolei (przy blokadzie także z bramką, na której błąd utknął).
3. **Badanie zgodności** – od wyjść w głąb (DFS po wejściach), potem pozostałe ustalone linie. Wiersz dla każdej bramki z ustaloną wartością 0/1 (także takiej, której wartość już wynika z wejść) oraz dla linii z D/~D, której wartość nie wynika z wejść; wiersz pokazuje wszystkie wejścia bramki, a „Wymagane:” – wejścia, od których zależy wartość (`neededInputs`). Opcje z `requirementOptions` (dla 0/1 = pierwotne sześciany, Tabela 5; linia w zasięgu błędu może dostać D/~D, np. XOR(D, ~D) = 1). Brak opcji → „SPRZECZNOŚĆ … Funkcja logiczna bramki wyklucza taki wynik”.

Ważne szczegóły:
- **Nawracanie wybiera użytkownik.** Każdy wybór z >1 opcją trafia do `decision_log` (`excite_*`, `branch_*`, `prop_*`, `just_*`); wybór pochodzi z `userChoices` (domyślnie 0). Po sprzeczności próba się kończy (bez wiersza podsumowania).
- `resolveName` przechodzi przez łańcuch `NODE` do źródła – wymaganie na węźle dotyczy źródła; dwa wejścia z tej samej linii dostają tę samą wartość. `assignState` propaguje wartość w górę i w dół przez węzły.
- `prepare()` ustala kolumny, kolejność topologiczną bramek (`gates`), odbiorców linii (`consumers`), wyjścia (linie, których nic nie czyta) i zasięg błędu (`cone`).
- Kolejność kolumn: `IN` → bramki → `NODE`, w obrębie grupy wg cyfr w nazwie (`sortKey`) – nazwy bez cyfr dostają 0.
- Komunikaty kroków są po polsku i trafiają bezpośrednio do tabeli w UI (renderowane jako HTML).

## Testy

- Wbudowany moduł testów Node.js (`node:test`, `node:assert/strict`), bez pakietów npm. Pliki `tests/*.test.js`.
- `tests/oracle.js` – **niezależna wyrocznia** (nie korzysta z silnika): symulacja 0/1 i w D-algebrze dla bramek o dowolnej liczbie wejść, `Oracle` (wszystkie wektory wejściowe z wartościami linii dla jednej usterki; `realizable(stan)` mówi, czy przypisania z tabeli da się zrealizować).
- `tests/helpers.js` – uruchamianie silnika, `explore` (przejście całego drzewa decyzji, każdy przebieg raz; przekroczenie limitu przebiegów to błąd testu, a nie ciche pominięcie), `checkRun`/`checkFault` (zasady poprawnej tabeli z kategoriami naruszeń: `struktura`, `test`, `sprzecznosc`, `kompletnosc`, `opcje`).
- `examples.test.js` – przykłady aplikacji, układy z zajęć (`tests/fixtures/tester/*.json`, z `konwertuj_gat.js`) i układ ze str. 41 w wersji 2-wejściowej; pilnuje też, by klucz odpowiedzi w `tests/fixtures/do-sprawdzenia/README.md` zgadzał się z wyrocznią. `materials.test.js` – tabele 2–5 i przykłady z `Materiały.pdf` (`tests/fixtures/materialy/uklad-g1-g9.json` – układ ze str. 33/41 z 3-wejściowym OR; silnik musi znaleźć test ze str. 41, bez porównywania tabeli wiersz w wiersz). `random.test.js` – 2×150 losowych układów (`random_circuits.js`, generator z ziarnem mulberry32, 2–5 wejść, 3–10 bramek, rozgałęzienie zawsze przez jeden węzeł). `engine.test.js` – scenariusze i minimalne układy błędów wersji 1.1.0 (`tests/fixtures/do-sprawdzenia/blad-*.json`). `gates.test.js` – funkcje bramek. `przyklady.test.js` – generator `examples.js`.
- `tests/fixtures/do-sprawdzenia/` – układy do ręcznego sprawdzania w aplikacji (Plik → Wczytaj układ) z kluczem odpowiedzi w `README.md` (wszystkie testy każdej usterki wg wyroczni, zapis wzorcami z x).
- Silnik JS jest wierną kopią dawnego silnika w Pythonie (`engine.py`, wersje do 1.3.0) – przed jego usunięciem porównano wyniki obu silników dla każdej ścieżki decyzji na wszystkich układach z repozytorium i 2000 losowych (ok. 200 tys. przebiegów, 0 różnic). Błędy wersji 1.1.0 (fałszywe testy i sprzeczności przy rekonwergencji, propagacja jedną ścieżką, wspólne źródło wejść bramki, podsumowanie po sprzeczności) są naprawione.

## Materiały źródłowe (poza repozytorium)

- `../Materiały.pdf` – wykład/instrukcje: D-algebra i Tabela 2 (str. 32–36, **errata**: kolumny f_AND i f_OR zamienione, w wierszu (~D,~D) f_AND = D zamiast ~D), D-algorytm z Tabelami 3–5 i przykładem tabeli (str. 37–41), przykład wymagający propagacji wieloma ścieżkami (str. 42), miary sterowalności/obserwowalności (str. 43–45; uwaga: c¹(x) = 0 dla komplementarnych wejść na str. 44 wygląda na błąd – powinno być „nieosiągalne”), PODEM z wagami WO/WK i przykładem (str. 46–50). Druga wersja tego samego wykładu: str. 61–69.
- `../MiDST/TESTER/` – program TESTER (Turbo Pascal for Windows, 1996) używany na zajęciach, **z kodem źródłowym**: `DALGEBRA.PAS` (D-sześciany), `MYOBJCTS.PAS` (pobudzenie, propagacja wskazaną przez studenta ścieżką, badanie zgodności, tryb testu z punktacją), `TESTER.PAS` (UI). Pliki `.PAS` w CP1250. Bramki max 2-wejściowe, usterki na wejściach elementów. `../MiDST/EDYTOR/` – edytor schematów, `scanedu/` – niezwiązane (boundary scan).

## Konwencje

- **Priorytetem jest czystość kodu i przejrzystość repozytorium.** Wybieraj najprostsze rozwiązanie; nie dodawaj narzędzi, automatyzacji ani warstw, które nie są niezbędne (np. wersja nie jest zapisywana w kodzie ani wyliczana z commitów – decyduje etykieta PR).
- Styl kodu zwarty (wiele instrukcji w jednej linii, krótkie nazwy zmiennych) – zachowywać spójność z otoczeniem.
- Zmiany w strukturze komponentu muszą być zgodne po obu stronach (`index.html`: `add`, `restoreComponents`, `saveWorkspace`, `autoSave`; `web/engine.js`) oraz ze starymi plikami JSON/`localStorage`.
- Po zmianie przykładów JSON uruchomić `npm run przyklady`.
- Po zmianach w `web/engine.js` uruchomić `npm test`. Poprawność tabel rozstrzyga wyrocznia (`tests/oracle.js`), a nie porównanie z poprzednim wynikiem silnika.
- Komunikaty skryptów wypisywane po polsku – `sys.stdout.reconfigure(encoding='utf-8')` jest potrzebne w konsoli Windows (cp1252).
- Commity: Conventional Commits po angielsku (`feat:`, `fix:`, `chore:`, `refactor:`…).
- **Przy tworzeniu PR zawsze zapytaj użytkownika o rodzaj wydania** – `patch` / `minor` / `major` / bez wydania – podając swoją propozycję z krótkim uzasadnieniem, i ustaw wybraną etykietę na PR (`gh pr create --label …` lub `gh pr edit --add-label …`). Bez etykiety PR nie tworzy release'u.
