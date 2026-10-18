// Losowe układy (powtarzalne – wyznaczone ziarnem) sprawdzane niezależną wyrocznią.
//
// Dwie rodziny po 150 układów wielkości jak na zajęciach: bez rekonwergencji i z rekonwergencją
// (ścieżki, które rozchodzą się i ponownie spotykają – tam najłatwiej o błędy D-algorytmu).
const test = require('node:test');
const assert = require('node:assert/strict');

const { checkFault, gateTargets, report } = require('./helpers.js');
const { randomCircuit } = require('./random_circuits.js');

const SEEDS = 150;
const LIMIT = 50000;  // maks. liczba przebiegów (kombinacji decyzji) na jedną usterkę – przekroczenie to błąd testu

for (const reconvergent of [false, true]) {
    for (let seed = 0; seed < SEEDS; seed++) {
        test(`losowy układ ${seed} ${reconvergent ? 'z rekonwergencją' : 'bez rekonwergencji'}`, () => {
            const comps = randomCircuit(seed, reconvergent);
            const problems = gateTargets(comps).flatMap(t => ['sa0', 'sa1'].flatMap(f => checkFault(comps, t, f, LIMIT)));
            assert.ok(!problems.length, report(problems));
        });
    }
}
