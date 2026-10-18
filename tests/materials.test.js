// Zgodność z materiałami do zajęć (Materiały.pdf) – tabele D-algebry, D-sześcianów i przykłady z rozwiązaniami.
//
// Część testów sprawdza silnik, a część samą wyrocznię testów i przepisane dane (połączenia układu z przykładu),
// porównując je z kilkoma niezależnymi wynikami z materiałów.
const test = require('node:test');
const assert = require('node:assert/strict');

const { DAlgorithmEngine } = require('../web/engine.js');
const { circuit, explore, finalState, fixtures, loadCircuit } = require('./helpers.js');
const { Oracle, dGate, dSimulate } = require('./oracle.js');

const EXAMPLE = loadCircuit(fixtures('materialy')['uklad-g1-g9']);
const COMPS = EXAMPLE.components;
const GATES = ['AND', 'OR', 'NAND', 'NOR', 'XOR'];
const N = '~D';
const rows = list => new Set(list.map(r => r.join('|')));

// Tabela 2 (str. 35) dokładnie tak, jak jest wydrukowana: x1, x2, f_AND, f_OR, f_NAND, f_NOR, f_XOR
const TABELA_2 = [
    ['0', '0', '0', '0', '1', '1', '0'], ['0', '1', '1', '0', '1', '0', '1'], ['0', 'D', 'D', '0', '1', N, 'D'],
    ['0', N, N, '0', '1', 'D', N], ['1', '0', '1', '0', '1', '0', '1'], ['1', '1', '1', '1', '0', '0', '0'],
    ['1', 'D', '1', 'D', N, '0', N], ['1', N, '1', N, 'D', '0', 'D'], ['D', '0', 'D', '0', '1', N, 'D'],
    ['D', '1', '1', 'D', N, '0', N], ['D', 'D', 'D', 'D', N, N, '0'], ['D', N, '1', '0', '1', '0', '1'],
    [N, '0', N, '0', '1', 'D', N], [N, '1', '1', N, 'D', '0', 'D'], [N, 'D', '1', '0', '1', '0', '1'],
    [N, N, 'D', N, 'D', 'D', '0'],
];

// Tabela 3 (str. 38) – pierwotne D-sześciany: wejścia wymuszające D / ~D na wyjściu bramki
const TABELA_3 = {
    AND: [['0', 'x', N], ['x', '0', N], ['1', '1', 'D']],
    OR: [['1', 'x', 'D'], ['x', '1', 'D'], ['0', '0', N]],
    NAND: [['0', 'x', 'D'], ['x', '0', 'D'], ['1', '1', N]],
    NOR: [['1', 'x', N], ['x', '1', N], ['0', '0', 'D']],
    XOR: [['0', '0', N], ['1', '1', N], ['0', '1', 'D'], ['1', '0', 'D']],
};

// Tabela 4 (str. 39) – przesyłowe D-sześciany
const TABELA_4 = {
    AND: [['D', '1', 'D'], ['1', 'D', 'D'], [N, '1', N], ['1', N, N]],
    OR: [['D', '0', 'D'], ['0', 'D', 'D'], [N, '0', N], ['0', N, N]],
    NAND: [['D', '1', N], ['1', 'D', N], [N, '1', 'D'], ['1', N, 'D']],
    NOR: [['D', '0', N], ['0', 'D', N], [N, '0', 'D'], ['0', N, 'D']],
    XOR: [['0', 'D', 'D'], ['D', '0', 'D'], [N, '0', N], ['0', N, N], ['1', 'D', N], ['D', '1', N], ['1', N, 'D'], [N, '1', 'D']],
};

// Tabela 5 (str. 40) – pierwotne sześciany
const TABELA_5 = {
    AND: [['0', 'x', '0'], ['x', '0', '0'], ['1', '1', '1']],
    OR: [['1', 'x', '1'], ['x', '1', '1'], ['0', '0', '0']],
    NAND: [['0', 'x', '1'], ['x', '0', '1'], ['1', '1', '0']],
    NOR: [['1', 'x', '0'], ['x', '1', '0'], ['0', '0', '1']],
    XOR: [['0', '0', '0'], ['1', '1', '0'], ['1', '0', '1'], ['0', '1', '1']],
};

// --- D-algebra (wyrocznia) ---

test('Tabela 2: NAND, NOR, XOR', () => {
    for (const [x1, x2, , , fNand, fNor, fXor] of TABELA_2) {
        assert.deepEqual([dGate('NAND', x1, x2), dGate('NOR', x1, x2), dGate('XOR', x1, x2)], [fNand, fNor, fXor], `${x1}, ${x2}`);
    }
});

test('Tabela 2: errata AND/OR', () => {
    // W materiałach kolumny f_AND i f_OR są zamienione, a w wierszu (~D, ~D) w kolumnie f_AND jest D zamiast ~D.
    for (const [x1, x2, fAnd, fOr] of TABELA_2) {
        assert.equal(dGate('AND', x1, x2), fOr, `${x1}, ${x2}`);
        if (!(x1 === N && x2 === N)) assert.equal(dGate('OR', x1, x2), fAnd, `${x1}, ${x2}`);
    }
    assert.equal(dGate('OR', N, N), N);  // wydrukowano D
});

for (const gate of GATES) {
    test(`Tabela 4 zgodna z D-algebrą: ${gate}`, () => {
        assert.deepEqual(rows(TABELA_4[gate].map(([a, b]) => [a, b, dGate(gate, a, b)])), rows(TABELA_4[gate]));
    });
}

// --- Silnik a tabele D-sześcianów ---

for (const gate of GATES) {
    for (const value of ['0', '1']) {
        test(`Tabela 5: pierwotne sześciany ${gate} = ${value}`, () => {
            // Badanie zgodności dla bramki z nieustalonymi wejściami proponuje dokładnie pierwotne sześciany z materiałów.
            const eng = new DAlgorithmEngine(circuit({ X1: 'IN', X2: 'IN', G1: [gate, 'X1', 'X2'] }), 'G1', 'sa0', {});
            eng.prepare();
            const cubes = eng.requirementOptions('G1', value).map(o => [o.X1 ?? 'x', o.X2 ?? 'x', value]);
            assert.deepEqual(rows(cubes), rows(TABELA_5[gate].filter(r => r[2] === value)));
        });
    }

    test(`Tabela 3: pobudzenie ${gate}`, () => {
        // Pobudzenie błędu na wyjściu bramki wybiera dokładnie pierwotne D-sześciany z materiałów.
        const comps = circuit({ X1: 'IN', X2: 'IN', G1: [gate, 'X1', 'X2'] });
        const found = [];
        for (const [fault, out] of [['sa0', 'D'], ['sa1', N]]) {
            for (const [, res] of explore(comps, 'G1', fault)[0]) {
                const step = res.steps.find(s => s.msg.startsWith('Pobudzenie'));
                found.push([step.s.X1, step.s.X2, out]);
            }
        }
        assert.deepEqual(rows(found), rows(TABELA_3[gate]));
    });

    test(`Tabela 4: propagacja ${gate}`, () => {
        // Propagacja przez bramkę ustawia drugie wejście i wyjście zgodnie z przesyłowymi D-sześcianami.
        const found = [];
        for (const ins of [['F', 'XB'], ['XB', 'F']]) {
            const comps = circuit({ XA: 'IN', XB: 'IN', F: ['NOT', 'XA'], G: [gate, ...ins] });
            for (const fault of ['sa0', 'sa1']) {
                for (const [, res] of explore(comps, 'F', fault)[0]) {
                    const step = res.steps.find(s => s.msg.startsWith('Propagacja błędu przez G'));
                    found.push([step.s[ins[0]], step.s[ins[1]], step.s.G]);
                }
            }
        }
        assert.deepEqual(rows(found), rows(TABELA_4[gate]));
    });
}

// --- Układ G1–G9 z materiałów: sprawdzenie przepisanych połączeń wynikami ze str. 33 i 41 ---

test('symulacja ze str. 33', () => {
    const sim = EXAMPLE.symulacja_str33;
    const values = dSimulate(COMPS, sim.wejscia, sim.usterka);
    assert.deepEqual(Object.fromEntries(Object.keys(sim.wartosci).map(k => [k, values[k]])), sim.wartosci);
});

function allFills(t) {
    const free = Object.keys(t).filter(k => t[k] === 'x');
    const fixed = Object.fromEntries(Object.entries(t).filter(([, v]) => v !== 'x').map(([k, v]) => [k, +v]));
    return Array.from({ length: 2 ** free.length }, (_, m) =>
        ({ ...fixed, ...Object.fromEntries(free.map((k, i) => [k, (m >> (free.length - 1 - i)) & 1])) }));
}

const lastRowInputs = () => Object.fromEntries(Object.entries(EXAMPLE.dalgorytm_str41.tabela.at(-1).wartosci).filter(([k]) => k.startsWith('X')));

test('test ze str. 41 wykrywa usterkę', () => {
    // Test z tabeli na str. 41 (x,1,1,1,0,x) wykrywa usterkę G2 s-a-1 dla każdego uzupełnienia x.
    const oracle = new Oracle(COMPS, 'G2', 1);
    for (const vec of allFills(lastRowInputs())) {
        const values = oracle.matching(Object.fromEntries(Object.entries(vec).map(([k, v]) => [k, String(v)])))[0][1];
        assert.ok(oracle.outputs.some(o => ['D', N].includes(values[o])), JSON.stringify(vec));
    }
});

test('tabela ze str. 41 zgodna z symulacją', () => {
    // Wiersze „Stan końcowy” i „Test” z materiałów zgadzają się z symulacją dla każdego uzupełnienia x.
    const oracle = new Oracle(COMPS, 'G2', 1);
    for (const row of EXAMPLE.dalgorytm_str41.tabela) {
        if (!['stan_koncowy', 'test'].includes(row.etap)) continue;
        assert.ok(oracle.matching(row.wartosci).length, row.etap);
        const pis = Object.fromEntries(Object.entries(row.wartosci).filter(([k, v]) => k.startsWith('X') && v !== 'x'));
        for (const [vec, values] of oracle.matching(pis)) {
            if (row.etap === 'test') {
                assert.ok(Object.entries(row.wartosci).every(([k, v]) => v === 'x' || values[k] === v), JSON.stringify(vec));
            }
        }
    }
});

test('przykład ze str. 42 ma jeden test', () => {
    // Błąd 6/0 z przykładu na str. 42 (edytor-6, linia G11) ma tylko jeden test (0,0,0,0).
    const comps = loadCircuit(fixtures('tester')['edytor-6']).components;
    assert.deepEqual(new Oracle(comps, 'G11', 0).tests(), [{ X0: 0, X1: 0, X2: 0, X3: 0 }]);
});

// --- D-algorytm na układzie z materiałów (str. 41) ---

test('D-algorytm znajduje test ze str. 41', () => {
    // Silnik wyznacza ten sam test co tabela ze str. 41 (x,1,1,1,0,x).
    const expected = JSON.stringify(lastRowInputs());
    const tests = explore(COMPS, 'G2', 'sa1')[0].map(([, res]) => finalState(res)).filter(s => s)
        .map(s => JSON.stringify(Object.fromEntries(Object.entries(s).filter(([k]) => k.startsWith('X')))));
    assert.ok(tests.includes(expected));
});
