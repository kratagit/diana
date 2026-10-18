// Generator web/examples.js (buduj_przyklady.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { buduj, generujExamplesJs } = require('../buduj_przyklady.js');

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'diana-'));

test('generator przykładów', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, '10.json'), '{"components": {}}');
    fs.writeFileSync(path.join(dir, '2.json'), '{"components": {"X1": {}}}');
    fs.writeFileSync(path.join(dir, 'uklad.json'), '{}');  // ignorowany - nazwa nie jest liczbą
    const out = path.join(dir, 'web', 'examples.js');
    assert.deepEqual(buduj(dir, out), ['2.json', '10.json']);
    assert.equal(fs.readFileSync(out, 'utf8'), 'const EXAMPLES = {\n    2: {"components": {"X1": {}}},\n    10: {"components": {}},\n};\n');
});

test('generator odrzuca uszkodzony JSON', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, '1.json'), '{zepsuty');
    assert.throws(() => generujExamplesJs(dir), SyntaxError);
});
