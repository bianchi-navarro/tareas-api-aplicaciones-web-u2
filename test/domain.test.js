import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTitle, parse, taskCreate, taskPatch, parseId, parseVersion } from '../src/domain/validation.js';

test('25. Transformaciones puras normalizan sin mutar la entrada', () => {
  const input = Object.freeze({ title: '  Entrega Final  ' });
  const result = parse(taskCreate, input);
  assert.equal(result.title, 'Entrega Final'); assert.equal(input.title, '  Entrega Final  ');
  assert.equal(normalizeTitle('ＡＰＩ'), 'api');
  assert.deepEqual(result, { title: 'Entrega Final', description: '', status: 'pendiente', priority: 'media' });
});
test('26. PATCH admite cambios parciales sin introducir valores por defecto', () => {
  assert.deepEqual(parse(taskPatch, { priority: 'alta' }), { priority: 'alta' });
});
test('27. Identificadores y versiones aceptan solo enteros positivos seguros', () => {
  assert.equal(parseId('12'), 12); assert.equal(parseVersion('"7"'), 7);
  for (const value of ['01', '1e2', '', 'Infinity']) assert.throws(() => parseId(value));
  for (const value of ['W/"1"', '*', '"0"', '"9007199254740992"']) assert.throws(() => parseVersion(value));
});
