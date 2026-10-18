// Przykłady wbudowane w aplikację oraz układy z zajęć (program TESTER, tests/fixtures/tester).
//
// Dla każdej bramki, obu typów usterki i każdej ścieżki w drzewie decyzji sprawdzamy niezależną wyrocznią,
// że tabela jest zgodna z prawdą: test wykrywa usterkę, wartości linii zgadzają się z symulacją,
// każda sprzeczność jest prawdziwa, a każda testowalna usterka ma ścieżkę prowadzącą do testu.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { generujExamplesJs } = require('../buduj_przyklady.js');
const { ROOT, appExamples, checkFault, fixtures, gateTargets, loadCircuit, report } = require('./helpers.js');
const { Oracle, gateInputs, primaryInputs, primaryOutputs } = require('./oracle.js');

const MANUAL = fixtures('do-sprawdzenia');
const CIRCUITS = { ...appExamples(), ...fixtures('tester'), 'materialy-str41': MANUAL['materialy-str41'] };
const readText = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

test('układy istnieją', () => {
    assert.ok(Object.keys(appExamples()).length, 'brak przykładowych układów [NUMER].json');
    assert.equal(Object.keys(fixtures('tester')).length, 11);
});

for (const [name, file] of Object.entries(CIRCUITS)) {
    const comps = loadCircuit(file).components;
    for (const target of gateTargets(comps)) {
        for (const fault of ['sa0', 'sa1']) {
            test(`tabele zgodne z prawdą: ${name}-${target}-${fault}`, () => {
                const problems = checkFault(comps, target, fault);
                assert.ok(!problems.length, report(problems));
            });
        }
    }
}

test('web/examples.js jest aktualny', () => {
    assert.equal(readText(path.join(ROOT, 'web', 'examples.js')), generujExamplesJs(ROOT),
                 'web/examples.js jest nieaktualny - uruchom: node buduj_przyklady.js');
});

// Wyrażenia opisujące wyjścia układu niezależnie od nazw elementów i kolejności wejść bramek.
function structure(comps) {
    const memo = {};
    const expr = cid => {
        if (!(cid in memo)) {
            const c = comps[cid], ins = gateInputs(c).map(expr).sort();
            memo[cid] = c.type === 'IN' ? 'IN' : c.type === 'NODE' ? ins[0] : `${c.type}(${ins.join(',')})`;
        }
        return memo[cid];
    };
    return primaryOutputs(comps).map(expr).sort();
}

for (const n of ['1', '2', '4', '5']) {
    test(`konwerter TESTER-a odtwarza przykład ${n}`, () => {
        // Przykłady 1, 2, 4, 5 odtworzono kiedyś w aplikacji ręcznie z TESTER-a – konwerter .GAT musi dać ten sam układ.
        const app = loadCircuit(CIRCUITS[`przyklad-${n}`]).components;
        const converted = loadCircuit(CIRCUITS[`tester-${n}`]).components;
        assert.deepEqual(structure(app), structure(converted));
    });
}

test('klucz odpowiedzi do ręcznego sprawdzania zgadza się z wyrocznią', () => {
    // Klucz w tests/fixtures/do-sprawdzenia/README.md: rozwinięte wzorce z x = wszystkie testy usterki.
    const sections = readText(path.join(ROOT, 'tests', 'fixtures', 'do-sprawdzenia', 'README.md')).split('\n### `').slice(1);
    let rows = 0;
    for (const section of sections) {
        const name = section.split('.json')[0];
        const comps = loadCircuit(MANUAL[name]).components;
        const pis = primaryInputs(comps);
        for (const [, target, stuck, cell] of section.matchAll(/^\| (\S+) s-a-([01]) \| (.*) \|$/gm)) {
            const listed = new Set();
            for (const [, pattern] of cell.matchAll(/`([01x]+)`/g)) {
                let vectors = [''];
                for (const ch of pattern) vectors = vectors.flatMap(v => ch === 'x' ? [v + '0', v + '1'] : [v + ch]);
                vectors.forEach(v => listed.add(v));
            }
            const truth = new Set(new Oracle(comps, target, +stuck).tests().map(v => pis.map(p => v[p]).join('')));
            assert.deepEqual(listed, truth, `${name} ${target} s-a-${stuck}`);
            rows++;
        }
    }
    assert.ok(rows > 100);
});
