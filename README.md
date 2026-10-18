# DIANA – interaktywny system diagnostyki i analizy układów cyfrowych

**DIANA** (*DIagnostyka i ANAliza układów cyfrowych*) to narzędzie edukacyjno-inżynierskie pozwalające na projektowanie układów logicznych i automatyczne generowanie wektorów testowych (ATPG) dla pojedynczych usterek typu *stuck-at* (s-a-0, s-a-1). Projekt implementuje klasyczny D-Algorytm (pobudzenie, propagacja, badanie zgodności) z wyborem alternatywnych decyzji przez użytkownika i tabelą krok po kroku.

Cała aplikacja – edytor schematów i silnik D-algorytmu – jest napisana w czystym JavaScripcie (Vanilla JS / SVG) i działa jako aplikacja okienkowa [Electron](https://www.electronjs.org/), także offline.

## 📥 Instalacja

Pobierz plik dla swojego systemu z [najnowszego wydania](https://github.com/kratagit/diana/releases/latest):

| System | Plik | Jak zainstalować |
|---|---|---|
| **Windows** (10/11, 64-bit) | `diana-<wersja>-windows-x64-setup.exe` | Uruchom instalator – DIANA zainstaluje się bez uprawnień administratora i pojawi się w menu Start i na pulpicie. Odinstalowanie: Ustawienia → Aplikacje. |
| **macOS** (Intel i Apple Silicon) | `diana-<wersja>-macos-universal.dmg` | Otwórz plik `.dmg` i przeciągnij DIANA do folderu Aplikacje. |
| **Linux** (64-bit) | `diana-<wersja>-linux-x64.AppImage` | Nadaj prawo wykonania (`chmod +x diana-*.AppImage`) i uruchom. |
| **Linux** (Ubuntu, Debian) | `diana-<wersja>-linux-x64.deb` | `sudo apt install ./diana-<wersja>-linux-x64.deb` |

Aplikacja nie jest podpisana certyfikatem, dlatego system może ją zablokować przy pierwszym uruchomieniu:

* **Windows** – w okienku „System Windows ochronił ten komputer” kliknij **Więcej informacji → Uruchom mimo to**.
* **macOS** – przy pierwszym uruchomieniu pojawi się komunikat, że nie można sprawdzić aplikacji. Otwórz **Ustawienia systemowe → Prywatność i ochrona** i kliknij **Otwórz mimo to** (wystarczy raz).
* **Linux (AppImage)** – jeśli plik się nie uruchamia, doinstaluj bibliotekę FUSE (np. `sudo apt install libfuse2`) albo użyj pakietu `.deb`.

---

## 🏗️ Architektura Rozwiązania

Interfejs i silnik działają w jednym oknie Electrona (`main.js` otwiera `web/index.html`), bez serwera obliczeniowego i bez komunikacji między procesami.

### 1. Warstwa Prezentacji (Frontend - Web UI)
Cały interfejs działa w oparciu o silnik przeglądarki, używając natywnego HTML5, Vanilla JavaScript oraz manipulacji DOM i SVG. Zrezygnowano z ciężkich frameworków (np. React) na rzecz surowej wydajności w zarządzaniu setkami wtyczek i kabli.

* **Silnik Renderujący (SVG & DOM):** Bramki logiczne to obiekty DOM nakładane na absolutnie pozycjonowany kontener. Przewody (kable) renderowane są pod spodem jako ścieżki wektorowe w `<svg>`. Dzięki temu kable mogą być swobodnie załamywane (waypoints), "przyklejane" do siatki prostopadle (snapping przy użyciu klawisza SHIFT) oraz chwytane myszą.
* **Zarządzanie Stanem (State Management):** Architektura opiera się na globalnym obiekcie słownikowym `comps`, przechowującym identyfikatory, typy, pozycje X/Y oraz referencje wejść i ścieżek wszystkich komponentów na planszy.
* **Persystencja Danych:** Wszelkie zmiany graficzne na planszy, ustawienia wybranej bramki czy alternatywne decyzje algorytmu są na bieżąco, asynchronicznie (debounce) zapisywane do pamięci przeglądarki (`localStorage`). Pozwala to na kontynuowanie pracy nawet po zamknięciu aplikacji bez konieczności ręcznego zapisu pliku.
* **Responsywność Algorytmu:** Zmiana parametrów (np. awaria `s-a-0` / `s-a-1` lub cel usterki) od razu przelicza tabelę i drzewo decyzji – silnik działa w tym samym oknie.

### 2. Warstwa Logiki (silnik D-algorytmu – `web/engine.js`)
Jądro aplikacji stanowi klasa `DAlgorithmEngine` (zwykły skrypt JS bez zależności – w oknie aplikacji klasa globalna, w testach moduł Node.js), odpowiedzialna za trawienie układu i proces decyzyjny.

* **Topologia i Reprezentacja Sieci:** Słownik komponentów przesłany z przeglądarki jest wstępnie filtrowany w celu rozdzielenia fizycznych bramek od węzłów (`NODE`). Węzły (kropki dystrybucyjne) służą jedynie do graficznego przekazywania sygnałów – algorytm wykorzystuje funkcję `resolveName`, która automatycznie "idzie po kablu" przez węzły tak długo, aż odnajdzie fizyczną bramkę, ignorując sztuczne komponenty graficzne przy liczeniu wymagań bramek.
* **Trójfazowy Silnik Decyzyjny:**
  1. **Pobudzenie błędu:** Wymuszenie stanu `1` (dla uszkodzenia `s-a-0`) lub `0` (dla uszkodzenia `s-a-1`) w węźle testowanym i zadeklarowanie wprowadzenia sygnału `D` lub `~D`.
  2. **Propagacja błędu:** Użytkownik wybiera kolejne bramki, przez które przechodzi błąd („Wybierz drogę”), aż błąd dotrze do wyjścia (można też poprowadzić go kilkoma ścieżkami naraz) – pozostałe wejścia każdej bramki dostają wartości nie-kontrolujące (np. 1 dla AND, 0 dla OR). Każda bramka ma w tabeli własny wiersz, a wiersz „Wybór ścieżki propagacji” podsumowuje wybraną drogę.
  3. **Badanie Zgodności Stanów (Cofanie/Justification):** Wsteczne przepychanie potrzebnych stanów logicznych w stronę wejść fizycznych (X0, X1...). 
* **Drzewo Decyzyjne (Backtracking):** Ze względu na to, że układ logiczny może wymagać kilku wejść, by osiągnąć pożądany stan (np. na wyjściu bramki OR stan '1' można uzyskać na trzy sposoby: `1-0`, `0-1`, `1-1`), silnik używa logiki decyzyjnej. Każdą sytuację wieloznaczną zapisuje w `decision_log`, a interfejs pokazuje ją jako listę rozwijaną w „Alternatywnych decyzjach” – zmiana wyboru przelicza tabelę.
* **Wykrywanie Sprzeczności:** Gdy wymagany na bramce sygnał łamie jej zasady (fizykę logiczną) dla narzuconego wcześniej punktu pracy układu, algorytm zwraca tzw. błąd, a w tabeli zjawia się stosowny, sformalizowany komentarz (wraz z wstrzykiwanym tagiem `ERR` by UI nałożyło czerwoną ikonę `❌`).

---

## 🚀 Uruchamianie, testy i budowanie

### Środowisko
[Node.js](https://nodejs.org/) 24, potem w katalogu projektu:
```bash
npm install
```

### Uruchomienie ze źródeł
```bash
npm start
```

### Testy
```bash
npm test
```
Testy działają na wbudowanym module testów Node.js (`node --test`, pliki `tests/*.test.js`). Każda tabela wygenerowana przez silnik jest sprawdzana **niezależną wyrocznią** (`tests/oracle.js` – symulacja układu zdatnego i z usterką w D-algebrze, bez użycia kodu silnika): wektor z wiersza „TEST” musi wykrywać usterkę, wartości linii muszą zgadzać się z symulacją, każda zgłoszona sprzeczność musi być prawdziwa, a każda testowalna usterka musi mieć ścieżkę decyzji prowadzącą do testu. Sprawdzane są wszystkie ścieżki decyzji dla:

* przykładów wbudowanych w aplikację,
* 11 układów z zajęć (program TESTER, `tests/fixtures/tester/`, konwertowane z plików `*.GAT` skryptem `konwertuj_gat.js`),
* 300 losowych układów wielkości jak na zajęciach (2–5 wejść, 3–10 bramek) – z rekonwergencją i bez,
* tabel D-algebry i D-sześcianów oraz rozwiązanych przykładów z materiałów do zajęć (`tests/materials.test.js`).

Układy do ręcznego sprawdzania w aplikacji (Plik → Wczytaj układ) wraz z kluczem odpowiedzi są w `tests/fixtures/do-sprawdzenia/`. Na GitHubie testy uruchamia workflow `CI` przy każdym pushu i pull requeście.

### Budowanie paczek
```bash
npm run dist   # przykłady -> paczka dla bieżącego systemu w dist/
```
Skrypt regeneruje `web/examples.js` i buduje electron-builderem paczkę dla systemu, na którym jest uruchomiony: na Windows instalator `dist/diana-0.0.0-windows-x64-setup.exe` (ok. 30 s), na macOS `.dmg`, na Linuksie `AppImage` i `.deb`. Testy uruchamia się osobno (`npm test`).

### Wydania (GitHub Releases)
Wydanie powstaje po merge'u PR na `main` oznaczonego etykietą `patch`, `minor` lub `major`. Workflow `Release` uruchamia testy, buduje paczki na trzech maszynach GitHuba (Windows, macOS, Linux) i publikuje release z plikami z tabeli w sekcji „Instalacja”. Wersja jest wyliczana automatycznie z ostatniego tagu `vX.Y.Z` (pierwsze wydanie: `v1.0.0`) i nie jest zapisana w kodzie:

| Etykieta | Kiedy | Przykład |
|---|---|---|
| `patch` | poprawki błędów | `1.2.3` → `1.2.4` |
| `minor` | nowe funkcje | `1.2.3` → `1.3.0` |
| `major` | zmiany niekompatybilne (np. nowy format pliku układu) | `1.2.3` → `2.0.0` |

PR bez etykiety nie tworzy wydania.

### Dodawanie wbudowanych przykładów (JSON)
1. Zapisz schemat za pomocą „Zapisz układ”.
2. Umieść plik jako `[NUMER].json` (np. `3.json`) w głównym katalogu projektu.
3. Uruchom `npm run przyklady` (robi to też `npm run dist`) – wszystkie pliki `[NUMER].json` zostaną zaszyte w `web/examples.js`, a przyciski w menu „Plik” wygenerują się same.

---
