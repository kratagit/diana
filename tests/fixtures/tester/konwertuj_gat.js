// Konwersja układów z programu TESTER (MiDST, Turbo Pascal 1996, pliki *.GAT) do formatu JSON aplikacji.
//
//     node tests/fixtures/tester/konwertuj_gat.js <katalog MiDST>
//
// Format *.GAT (obiekty Turbo Pascala zapisane przez TStream): nagłówek kolekcji bramek
// (typ obiektu 151, liczba elementów, limit, delta), a dla każdego elementu: typ obiektu 150,
// rodzaj (1 węzeł, 2 wejście, 3 wyjście, 4 NOT, 5 AND, 6 NAND, 7 OR, 8 NOR, 9 XOR, 10 XNOR),
// prostokąt na schemacie i numery elementów podłączonych do dwóch wejść (-1 = brak).
// Elementy wyjściowe (OUT) nie mają odpowiednika w aplikacji – wyjściem jest linia, której nic nie odczytuje.
const fs = require('fs');
const path = require('path');

const TYPES = { 1: 'NODE', 2: 'IN', 3: 'OUT', 4: 'NOT', 5: 'AND', 6: 'NAND', 7: 'OR', 8: 'NOR', 9: 'XOR', 10: 'XNOR' };
const SOURCES = {  // plik w MiDST -> [nazwa danych testowych, opis]
    'TESTER/1.GAT': ['tester-1', 'Układ z zajęć (TESTER 1.GAT).'],
    'TESTER/2.GAT': ['tester-2', 'Układ z zajęć (TESTER 2.GAT) – cztery wyjścia.'],
    'TESTER/3.GAT': ['tester-3', 'Układ z zajęć (TESTER 3.GAT) – multiplekser z rozgałęzieniem wejścia.'],
    'TESTER/4.GAT': ['tester-4', 'Układ z zajęć (TESTER 4.GAT) – łańcuch bramek wszystkich typów.'],
    'TESTER/5.GAT': ['tester-5', 'Układ z zajęć (TESTER 5.GAT) – dwa wyjścia, rozgałęzienia.'],
    'TESTER/a1.gat': ['tester-a1', 'Układ z zajęć (TESTER a1.gat).'],
    'TESTER/fff.gat': ['tester-fff', 'Układ z zajęć (TESTER fff.gat).'],
    'TESTER/rosa.gat': ['tester-rosa', 'Układ z zajęć (TESTER rosa.gat) – wiele rozgałęzień i ścieżek zbieżnych.'],
    'EDYTOR/6.GAT': ['edytor-6', 'Przykład z materiałów (str. 42): błąd 6/0 ma tylko jeden test (0,0,0,0) ' +
                                 'i wymaga propagacji dwiema ścieżkami jednocześnie.'],
    'EDYTOR/X.GAT': ['edytor-x', 'Układ z zajęć (EDYTOR X.GAT) – bramka AND z oboma wejściami z tego samego węzła.'],
    'EDYTOR/qaz.gat': ['edytor-qaz', 'Układ z zajęć (EDYTOR qaz.gat).'],
};

function parse(file) {
    const data = fs.readFileSync(file);
    if (data.readUInt16LE(0) !== 151) throw new Error(`${file}: nieznany nagłówek ${data.readUInt16LE(0)}`);
    return Array.from({ length: data.readInt16LE(2) }, (_, n) => {
        const at = 8 + 16 * n, field = k => data.readInt16LE(at + 2 * k);
        if (data.readUInt16LE(at) !== 150) throw new Error(`${file}: nieznany element ${data.readUInt16LE(at)}`);
        return { type: TYPES[field(1)], left: field(2), top: field(3), ins: [field(6), field(7)] };
    });
}

function toApp(gates, source, description) {
    const prefix = { IN: 'X', NODE: 'W', OUT: 'Y' };
    const ids = gates.map((g, i) => (prefix[g.type] || 'G') + i);
    const comps = {};
    gates.forEach((g, i) => {
        if (g.type === 'OUT') return;
        let ins = g.ins.map(j => j >= 0 ? ids[j] : null);
        if (g.type === 'IN') ins = [null, null];
        if (['NOT', 'NODE'].includes(g.type)) ins = [ins[0], null];
        comps[ids[i]] = { id: ids[i], type: g.type, x: Math.round(g.left * 1.6), y: Math.round(g.top * 1.6), inputs: ins, waypoints: [[], []] };
    });
    return { opis: description, zrodlo: `MiDST/${source}`, components: comps, counter: gates.length };
}

if (require.main === module) {
    const midst = process.argv[2];
    for (const [source, [name, description]] of Object.entries(SOURCES)) {
        const data = toApp(parse(path.join(midst, source)), source, description);
        fs.writeFileSync(path.join(__dirname, name + '.json'), JSON.stringify(data, null, 2));
        console.log(`${source} -> ${name}.json (${Object.keys(data.components).length} elementów)`);
    }
}
