import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeJWT, inspectJWTTimes, jwtExample, MAX_JWT_LENGTH } from '../public/jwt.js';
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = (payload, header = { alg: 'HS256', typ: 'JWT' }, signature = 'c2ln') => `${encode(header)}.${encode(payload)}.${signature}`;

test('JWT decodes UTF-8 objects, Bearer prefix and signature size without claiming verification', () => {
  const decoded = decodeJWT(` Bearer ${token({ name: '日用', roles: ['reader'], custom: '<script>' })} `);
  assert.equal(decoded.header.alg, 'HS256');
  assert.equal(decoded.payload.name, '日用');
  assert.equal(decoded.payload.custom, '<script>');
  assert.equal(decoded.signatureBytes, 3);
  assert.equal(decoded.verified, undefined);
  const example = decodeJWT(jwtExample(100000));
  assert.equal(example.payload.exp, 3700);
  assert.match(example.warnings.join(' '), /没有签名/);
});

test('JWT rejects malformed/oversized input, encrypted tokens, invalid JSON or UTF-8', () => {
  for (const bad of ['', 'a.b', 'a.b.c.d.e', 'a'.repeat(MAX_JWT_LENGTH + 1), token([]), token(null), token({}, []), token({}, { b64: false }), token({}, { alg: 'x' }, '%'), `${encode({})}._w.c2ln`, `${encode({})}.bm90LWpzb24.c2ln`, `${encode({})}.e30=.c2ln`]) assert.throws(() => decodeJWT(bad));
  assert.match(decodeJWT(token({}, { alg: 'HS256' }, '')).warnings.join(' '), /签名段为空/);
});

test('NumericDate uses seconds, includes epoch/fractions and does not coerce strings', () => {
  assert.equal(inspectJWTTimes({ exp: 0 }, 0).expired, true);
  assert.equal(inspectJWTTimes({ exp: 100 }, 99999).expired, false);
  assert.equal(inspectJWTTimes({ exp: 100 }, 100000).expired, true);
  assert.equal(inspectJWTTimes({ nbf: 10 }, 9999).pending, true);
  assert.equal(inspectJWTTimes({ exp: '100' }, 0).invalid, true);
  assert.equal(inspectJWTTimes({ exp: 1e100 }, 0).invalid, true);
  assert.equal(inspectJWTTimes({ iat: -0.5 }, 0).times[0].iso, '1969-12-31T23:59:59.500Z');
  assert.equal(inspectJWTTimes({}, 0).status, '未声明过期时间');
});
