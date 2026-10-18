// Uruchamianie silnika w testach i sprawdzanie wygenerowanych tabel.
//
// checkRun zwraca naruszenia zasad, które musi spełniać każda tabela – niezależnie od tego,
// jakie decyzje wybrał użytkownik. Prawdę ustala niezależna wyrocznia (oracle.js).
// Każde naruszenie ma kategorię, żeby testy mogły odróżnić rodzaje błędów.
const fs = require('fs');
const path = require('path');

const { DAlgorithmEngine } = require('../web/engine.js');
const { Oracle, faultCone } = require('./oracle.js');

const ROOT = path.dirname(__dirname);
const FIXTURES = path.join(ROOT, 'tests', 'fixtures');
const D_VALUES = ['D', '~D'];
const VALUES = ['0', '1', 'D', '~D', 'x'];

// Kategorie naruszeń
const STRUCTURE = 'struktura';        // budowa tabeli: stan początkowy, kolumny, wartości, zmiany już ustalonych linii
const TEST = 'test';                  // wiersz TEST niezgodny z symulacją albo wektor nie wykrywa usterki
const CONFLICT = 'sprzecznosc';       // zgłoszona sprzeczność/blokada/błąd pobudzenia, której w rzeczywistości nie ma
const COMPLETENESS = 'kompletnosc';   // usterka testowalna, a żadna ścieżka decyzji nie daje testu
const OPTIONS = 'opcje';              // wadliwa lista decyzji (powtórzone opcje, wybór poza zakresem)

// Buduje słownik komponentów w formacie aplikacji:
// circuit({X1: 'IN', W1: ['NODE', 'X1'], G1: ['AND', 'X1', 'X2'], G2: ['NOT', 'G1']})
function circuit(spec) {
    const comps = {};
    for (const [cid, s] of Object.entries(spec)) {
        const [ctype, ...ins] = typeof s === 'string' ? [s] : s;
        const inputs = [...ins, null, null].slice(0, Math.max(2, ins.length));
        comps[cid] = { id: cid, type: ctype, x: 0, y: 0, inputs, waypoints: [[], []] };
    }
    return comps;
}

function runEngine(components, target, faultType, choices = {}) {
    return new DAlgorithmEngine(components, target, faultType, choices).run();
}

// Stan z wiersza 'TEST' albo null, gdy algorytm nie wyznaczył testu.
function finalState(result) {
    const last = result.steps[result.steps.length - 1];
    return last && last.msg.startsWith('TEST') ? last.s : null;
}

// Przechodzi drzewo decyzji silnika (każdą kombinację wyborów z list rozwijanych).
// Zwraca listę [wybory, wynik] i informację, czy drzewo zostało przejrzane w całości.
// Każdy przebieg (ciąg decyzji, które naprawdę wystąpiły) jest uruchamiany raz: dla przebiegu z ustalonymi
// pierwszymi `fixed` decyzjami rozwijane są tylko alternatywy dalszych decyzji.
function explore(components, target, faultType, limit = 20000) {
    const out = [], stack = [[{}, 0]];
    while (stack.length && out.length < limit) {
        const [choices, fixed] = stack.pop();
        const res = runEngine(components, target, faultType, choices);
        const log = res.decision_log;
        out.push([Object.fromEntries(log.map(d => [d.id, d.selected])), res]);
        for (let k = fixed; k < log.length; k++) {
            const prefix = Object.fromEntries(log.slice(0, k).map(d => [d.id, d.selected]));
            for (let i = 0; i < log[k].options.length; i++) {
                if (i !== log[k].selected) stack.push([{ ...prefix, [log[k].id]: i }, k + 1]);
            }
        }
    }
    return [out, !stack.length];
}

function gateTargets(comps) {
    return Object.keys(comps).filter(c => !['IN', 'NODE'].includes(comps[c].type)).sort();
}

function loadCircuit(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Przykłady wbudowane w aplikację ([NUMER].json w katalogu głównym).
function appExamples() {
    const files = fs.readdirSync(ROOT).filter(f => /^\d+\.json$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
    return Object.fromEntries(files.map(f => [`przyklad-${f.slice(0, -5)}`, path.join(ROOT, f)]));
}

function fixtures(group) {
    const folder = path.join(FIXTURES, group);
    return Object.fromEntries(fs.readdirSync(folder).filter(f => f.endsWith('.json')).sort().map(f => [f.slice(0, -5), path.join(folder, f)]));
}

// Naruszenia zasad poprawnej tabeli D-algorytmu dla jednego przebiegu silnika: lista [kategoria, opis].
function checkRun(comps, target, faultType, result, oracle) {
    const problems = [];
    const { steps, cols } = result;
    if (!steps.length) return [[STRUCTURE, 'brak kroków']];
    if (!(steps[0].full && Object.values(steps[0].s).every(v => v === 'x'))) {
        problems.push([STRUCTURE, 'pierwszy wiersz nie jest stanem początkowym (same x)']);
    }

    const cone = faultCone(comps, target);
    let prev = {};
    steps.forEach((st, idx) => {
        const n = idx + 1, { s, delta } = st;
        const keys = Object.keys(s);
        if (keys.length !== cols.length || !cols.every(c => c in s)) problems.push([STRUCTURE, `krok ${n}: stan nie obejmuje wszystkich kolumn`]);
        if (Object.values(s).some(v => !VALUES.includes(v)) || Object.values(delta).some(v => ![...VALUES, 'ERR'].includes(v))) {
            problems.push([STRUCTURE, `krok ${n}: niedozwolona wartość`]);
        }
        for (const [k, v] of Object.entries(prev)) {
            if (v !== 'x' && s[k] !== v) problems.push([STRUCTURE, `krok ${n}: linia ${k} zmieniła wartość ${v} -> ${s[k]}`]);
        }
        for (const [k, v] of Object.entries(delta)) {
            if (['0', '1', ...D_VALUES].includes(v) && s[k] !== v) problems.push([STRUCTURE, `krok ${n}: wiersz pokazuje ${k}=${v}, a stan ma ${k}=${s[k]}`]);
        }
        for (const [k, v] of Object.entries(s)) {
            if (D_VALUES.includes(v) && !cone.has(k)) problems.push([STRUCTURE, `krok ${n}: ${k}=${v} poza zasięgiem błędu`]);
        }
        if (Object.values(delta).includes('ERR')) problems.push(...checkConflict(n, st, oracle));
        if (st.msg.startsWith('BŁĄD')) {
            const required = faultType === 'sa0' ? 'D' : '~D';
            if (oracle.realizable({}, d => d[target] === required)) {
                problems.push([CONFLICT, `krok ${n}: fałszywy błąd pobudzenia – ${target} da się wysterować`]);
            }
        }
        prev = s;
    });

    const state = finalState(result);
    if (state !== null) {
        const pis = Object.fromEntries(Object.entries(state).filter(([k, v]) => comps[k].type === 'IN' && v !== 'x'));
        for (const [vec, d] of oracle.matching(pis)) {
            if (!oracle.outputs.some(o => D_VALUES.includes(d[o]))) {
                problems.push([TEST, `TEST: wektor ${JSON.stringify(vec)} nie wykrywa usterki`]); break;
            }
            const wrong = Object.entries(state).filter(([k, v]) => v !== 'x' && d[k] !== v).map(([k, v]) => `${k}=${v} (naprawdę ${d[k]})`);
            if (wrong.length) {
                problems.push([TEST, `TEST: dla wejść ${JSON.stringify(vec)} tabela podaje nieprawdziwe wartości ${wrong.join(', ')}`]); break;
            }
        }
    } else if (!steps.some(st => Object.values(st.delta).includes('ERR') || st.msg.startsWith('BŁĄD'))) {
        problems.push([STRUCTURE, 'brak testu i brak wiersza wyjaśniającego (sprzeczność / błąd)']);
    }

    for (const d of result.decision_log) {
        const labels = d.options.map(o => o.label);
        if (labels.length !== new Set(labels).size) problems.push([OPTIONS, `decyzja ${d.id}: powtórzone opcje ${labels}`]);
        if (!(d.selected >= 0 && d.selected < labels.length)) problems.push([OPTIONS, `decyzja ${d.id}: wybór poza zakresem`]);
    }
    return problems;
}

// Sprzeczność jest prawdziwa, jeśli dotychczasowych przypisań nie da się zrealizować żadnym wektorem.
function checkConflict(n, step, oracle) {
    const s = step.s;
    const gate = Object.keys(step.delta).find(k => step.delta[k] === 'ERR');
    if (step.msg.includes('D-granica')) {
        if (oracle.realizable(s, d => oracle.outputs.some(o => D_VALUES.includes(d[o])))) {
            return [[CONFLICT, `krok ${n}: fałszywa pusta D-granica – przy obecnych przypisaniach błąd może dotrzeć do wyjścia`]];
        }
    } else if (step.msg.includes('Blokada propagacji')) {
        if (oracle.realizable(s, d => D_VALUES.includes(d[gate]))) {
            return [[CONFLICT, `krok ${n}: fałszywa blokada na ${gate} – przy obecnych przypisaniach błąd może przez nią przejść`]];
        }
    } else if (oracle.realizable(s)) {
        return [[CONFLICT, `krok ${n}: fałszywa sprzeczność na ${gate} – przypisania da się zrealizować`]];
    }
    return [];
}

// Wszystkie przebiegi dla jednej usterki: lista [kategoria, opis] ze wskazaniem wyborów użytkownika.
function checkFault(comps, target, faultType, limit = 20000) {
    const oracle = new Oracle(comps, target, faultType === 'sa0' ? 0 : 1);
    const [runs, complete] = explore(comps, target, faultType, limit);
    const problems = complete ? [] : [[STRUCTURE, `${target}/${faultType}: drzewo decyzji ma ponad ${limit} przebiegów ` +
                                                   '– nie wszystko zostało sprawdzone, zwiększ limit']];
    for (const [choices, res] of runs) {
        const where = `${target}/${faultType} ${Object.keys(choices).length ? JSON.stringify(choices) : 'domyślne wybory'}`;
        problems.push(...checkRun(comps, target, faultType, res, oracle).map(([cat, msg]) => [cat, `${where}: ${msg}`]));
    }
    if (complete && oracle.tests().length && !runs.some(([, r]) => finalState(r) !== null)) {
        problems.push([COMPLETENESS, `${target}/${faultType}: usterka jest testowalna (np. ${JSON.stringify(oracle.tests()[0])}), ` +
                                     'a żadna ścieżka decyzji nie daje testu']);
    }
    return problems;
}

// Czytelny opis naruszeń do komunikatu asercji.
function report(problems, limit = 8) {
    const lines = problems.slice(0, limit).map(([cat, msg]) => `[${cat}] ${msg}`);
    if (problems.length > limit) lines.push(`... i ${problems.length - limit} więcej`);
    return lines.join('\n');
}

module.exports = { ROOT, circuit, runEngine, finalState, explore, gateTargets, loadCircuit, appExamples, fixtures, checkRun, checkFault, report };
