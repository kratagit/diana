// Scenariusze silnika, minimalne układy błędów wersji 1.1.0 i przykład z materiałów (str. 41).
const test = require('node:test');
const assert = require('node:assert/strict');

const { checkFault, circuit, finalState, fixtures, loadCircuit, report, runEngine } = require('./helpers.js');
const { isTestable } = require('./oracle.js');

const msgs = res => res.steps.map(s => s.msg);

test('brak bramki z usterką daje pusty wynik', () => {
    assert.deepEqual(runEngine(circuit({ X1: 'IN' }), 'G99', 'sa0'), { cols: [], steps: [], decision_log: [] });
});

test('kolejność kolumn: wejścia, bramki, węzły', () => {
    const comps = circuit({ G10: ['NOT', 'X2'], W3: ['NODE', 'X1'], X2: 'IN', G2: ['AND', 'W3', 'X2'], X1: 'IN' });
    assert.deepEqual(runEngine(comps, 'G2', 'sa0').cols, ['X1', 'X2', 'G2', 'G10', 'W3']);
});

test('pojedyncza bramka AND, s-a-0', () => {
    const res = runEngine(circuit({ X1: 'IN', X2: 'IN', G1: ['AND', 'X1', 'X2'] }), 'G1', 'sa0');
    assert.deepEqual(finalState(res), { X1: '1', X2: '1', G1: 'D' });
    assert.deepEqual(res.decision_log, []);  // jedyna możliwość pobudzenia
    assert.ok(res.steps[0].full && res.steps.at(-1).full);
});

test('pojedyncza bramka AND, s-a-1: alternatywy pobudzenia', () => {
    const comps = circuit({ X1: 'IN', X2: 'IN', G1: ['AND', 'X1', 'X2'] });
    const res = runEngine(comps, 'G1', 'sa1');
    assert.deepEqual(finalState(res), { X1: '0', X2: 'x', G1: '~D' });
    const [dec] = res.decision_log;
    assert.equal(res.decision_log.length, 1);
    assert.equal(dec.id, 'excite_G1');
    assert.equal(dec.selected, 0);
    assert.deepEqual(dec.options.map(o => o.label), ['X1=0', 'X2=0']);

    const res2 = runEngine(comps, 'G1', 'sa1', { excite_G1: 1 });
    assert.deepEqual(finalState(res2), { X1: 'x', X2: '0', G1: '~D' });
    assert.equal(res2.decision_log[0].selected, 1);
});

test('propagacja ustawia wartość nie-kontrolującą na drugim wejściu', () => {
    const comps = circuit({ X1: 'IN', X2: 'IN', X3: 'IN', G1: ['AND', 'X1', 'X2'], G2: ['OR', 'G1', 'X3'] });
    assert.deepEqual(finalState(runEngine(comps, 'G1', 'sa0')), { X1: '1', X2: '1', X3: '0', G1: 'D', G2: 'D' });
});

test('bramki odwracające zmieniają D na ~D', () => {
    const comps = circuit({ X1: 'IN', X2: 'IN', X3: 'IN', G1: ['AND', 'X1', 'X2'], G2: ['NOT', 'G1'], G3: ['NAND', 'G2', 'X3'] });
    const s = finalState(runEngine(comps, 'G1', 'sa0'));
    assert.deepEqual([s.G1, s.G2, s.G3, s.X3], ['D', '~D', 'D', '1']);
});

test('rozgałęzienie przez węzeł daje wybór drogi', () => {
    const comps = circuit({ X1: 'IN', X2: 'IN', X3: 'IN', X4: 'IN', G1: ['AND', 'X1', 'X2'], W1: ['NODE', 'G1'],
                            G2: ['OR', 'W1', 'X3'], G3: ['AND', 'W1', 'X4'] });
    const res = runEngine(comps, 'G1', 'sa0');
    assert.equal(res.decision_log.length, 1);
    const [branch] = res.decision_log;
    assert.equal(branch.id, 'branch_G2_G3');
    assert.equal(branch.title, 'Propagacja błędu. Wybierz drogę:');
    assert.deepEqual(branch.options.map(o => o.label), ['Przez G2 (OR)', 'Przez G3 (AND)']);
    assert.equal(finalState(res).G2, 'D');

    const s = finalState(runEngine(comps, 'G1', 'sa0', { branch_G2_G3: 1 }));
    assert.deepEqual([s.G3, s.X4, s.W1, s.G2], ['D', '1', 'D', 'x']);
});

test('badanie zgodności dochodzi do wejść pierwotnych', () => {
    // Boczne wejście G3 pochodzi z bramki - musi zostać uzasadnione wstecz
    const comps = circuit({ X1: 'IN', X2: 'IN', X3: 'IN', X4: 'IN', G1: ['AND', 'X1', 'X2'], G2: ['NOR', 'X3', 'X4'], G3: ['AND', 'G1', 'G2'] });
    const s = finalState(runEngine(comps, 'G1', 'sa0'));
    assert.deepEqual([s.G3, s.G2, s.X3, s.X4], ['D', '1', '0', '0']);
});

test('sprzeczność przy rekonwergencji jest zgłaszana', () => {
    // Pobudzenie G1 sa0 wymaga X1=1, a propagacja przez G3 wymaga G2=NOT(X1)=1 -> X1=0
    const comps = circuit({ X1: 'IN', X2: 'IN', W1: ['NODE', 'X1'], G1: ['AND', 'W1', 'X2'], G2: ['NOT', 'W1'], G3: ['AND', 'G1', 'G2'] });
    const res = runEngine(comps, 'G1', 'sa0');
    assert.equal(finalState(res), null);
    const last = res.steps.at(-1);
    assert.ok(last.msg.includes('SPRZECZNOŚĆ'));
    assert.ok(Object.values(last.delta).includes('ERR'));
});

test('niemożliwe pobudzenie daje komunikat BŁĄD', () => {
    // G1 = AND(X1, -) z niepodłączonym wejściem nie da się wysterować na 1
    const res = runEngine(circuit({ X1: 'IN', G1: ['AND', 'X1', null] }), 'G1', 'sa0');
    assert.equal(finalState(res), null);
    assert.ok(res.steps.at(-1).msg.startsWith('BŁĄD'));
});

test('kroki mają spójną postać', () => {
    const comps = circuit({ X1: 'IN', X2: 'IN', X3: 'IN', G1: ['XOR', 'X1', 'X2'], G2: ['XNOR', 'G1', 'X3'] });
    const res = runEngine(comps, 'G1', 'sa1');
    for (const step of res.steps) {
        assert.deepEqual(Object.keys(step).sort(), ['delta', 'full', 'msg', 's']);
        assert.deepEqual(Object.keys(step.s).sort(), [...res.cols].sort());
        assert.ok(Object.keys(step.delta).every(k => res.cols.includes(k)));
    }
});

// --- Minimalne układy błędów wersji 1.1.0 (tests/fixtures/do-sprawdzenia/blad-*.json, opisane w README.md tamże) ---

const BLEDY = Object.fromEntries(Object.entries(fixtures('do-sprawdzenia')).filter(([name]) => name.startsWith('blad-')).map(([name, p]) => [name, loadCircuit(p)]));

function bugCase(name) {
    const data = BLEDY[name];
    const problems = checkFault(data.components, data.target, data.fault_type);
    assert.ok(!problems.length, report(problems));
}

test('fakty o minimalnych układach (wyrocznia)', () => {
    const comps = name => BLEDY[name].components;
    assert.ok(isTestable(comps('blad-1-zbiezne-galezie'), 'G1', 0));
    assert.ok(isTestable(comps('blad-2-to-samo-zrodlo'), 'G2', 1));
    assert.ok(!isTestable(comps('blad-3-falszywy-test'), 'G1', 0));
    assert.ok(!isTestable(comps('blad-3-falszywy-test'), 'G1', 1));
    assert.ok(isTestable(comps('blad-4-falszywa-sprzecznosc'), 'G1', 0));
    assert.ok(!isTestable(comps('blad-5-wiersz-po-sprzecznosci'), 'G1', 0));
});

test('zbieżne gałęzie: D na obu wejściach', () => bugCase('blad-1-zbiezne-galezie'));
test('oba wejścia bramki z tego samego sygnału', () => bugCase('blad-2-to-samo-zrodlo'));
test('usterka nietestowalna nie dostaje testu', () => bugCase('blad-3-falszywy-test'));
test('wymaganie spełnione wartościami D', () => bugCase('blad-4-falszywa-sprzecznosc'));

test('brak podsumowania po sprzeczności w propagacji', () => {
    const data = BLEDY['blad-5-wiersz-po-sprzecznosci'];
    const steps = runEngine(data.components, data.target, data.fault_type).steps;
    const conflict = steps.findIndex(s => Object.values(s.delta).includes('ERR'));
    assert.equal(conflict, steps.length - 1, steps.slice(conflict).map(s => s.msg).join('\n'));
});

// --- Przykład z materiałów (str. 41) w wersji z bramkami 2-wejściowymi ---

const MATERIALY = loadCircuit(fixtures('do-sprawdzenia')['materialy-str41']).components;

test('przykład z materiałów: wiersze tabeli', () => {
    const res = runEngine(MATERIALY, 'G2', 'sa1');
    assert.deepEqual(msgs(res), [
        'Stan początkowy układu',
        'Pobudzenie błędu: G2. Wymagane: X4=1',
        'Wybór ścieżki propagacji (G3, G5, G10, G7)',
        'Propagacja błędu przez G3 (NOR). Wymagane: G1=0',
        'Propagacja błędu przez G5 (AND). Wymagane: X3=1',
        'Propagacja błędu przez G10 (OR). Wymagane: G4=0',
        'Propagacja błędu przez G7 (OR). Wymagane: G6=0',
        'Stan po propagacji (Podsumowanie)',
        'Badanie zgodności stanu na G4=0. Wymagane: G1=0',
        'Badanie zgodności stanu na G1=0. Wymagane: X2=1',
        'Badanie zgodności stanu na G6=0. Wymagane: X5=0',
        'TEST (Stan końcowy układu)',
    ]);
    const steps = res.steps;
    assert.deepEqual(steps[2].delta, {});
    assert.deepEqual(steps[2].s, steps[1].s);
    assert.deepEqual(steps[5].delta, { G4: '0', G10: 'D' });
    assert.deepEqual(steps[8].delta, { X1: 'x', G1: '0', G4: '0' });
    assert.deepEqual(steps[10].delta, { G2: '~D', X5: '0', G6: '0' });  // wiersz pokazuje wszystkie wejścia bramki
    const branches = res.decision_log.filter(d => d.id.startsWith('branch_'));
    assert.deepEqual(branches.map(d => d.options.map(o => o.label)), [
        ['Przez G3 (NOR)', 'Przez G6 (AND)', 'Przez G8 (AND)'], ['Przez G5 (AND)', 'Przez G6 (AND)', 'Przez G8 (AND)'],
        ['Przez G10 (OR)', 'Przez G6 (AND)', 'Przez G8 (AND)'], ['Przez G7 (OR)', 'Przez G6 (AND)', 'Przez G8 (AND)']]);
});

test('przykład z materiałów: inna droga', () => {
    // droga przez G6 daje test 0,x,0,1,1,x – ten sam, który materiały podają na str. 50
    const res = runEngine(MATERIALY, 'G2', 'sa1', { branch_G3_G6_G8: 1 });
    assert.equal(msgs(res)[2], 'Wybór ścieżki propagacji (G6, G7)');
    const s = finalState(res);
    assert.deepEqual(['X1', 'X2', 'X3', 'X4', 'X5', 'X6'].map(x => s[x]), ['0', 'x', '0', '1', '1', 'x']);
});

test('przykład z materiałów: drogi, które się znoszą', () => {
    // do G7 dociera D (przez G10) i ~D (przez G6), OR(D, ~D) = 1
    const res = runEngine(MATERIALY, 'G2', 'sa1', { branch_G10_G6_G8: 1, branch_G7_G10_G8: 1 });
    assert.equal(msgs(res)[2], 'Wybór ścieżki propagacji (G3, G5, G6, G10, G7)');
    assert.equal(msgs(res).at(-1), 'SPRZECZNOŚĆ (Blokada propagacji) na G7! Błąd nie przechodzi (D i ~D znoszą się).');
});

test('brak wiersza wyboru ścieżki, gdy usterka jest na wyjściu', () => {
    const steps = runEngine(circuit({ X1: 'IN', X2: 'IN', G1: ['AND', 'X1', 'X2'] }), 'G1', 'sa0').steps;
    assert.ok(!steps.some(s => s.msg.startsWith('Wybór ścieżki')));
});
