import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { N42Error, N42ErrorCode } from '../src/core/error.js';

describe('N42ErrorCode', () => {
  it('is frozen', () => {
    assert.ok(Object.isFrozen(N42ErrorCode));
  });

  it('every entry has required fields', () => {
    for (const [key, def] of Object.entries(N42ErrorCode)) {
      assert.ok(typeof def.code    === 'number',  `${key}: code must be number`);
      assert.ok(typeof def.area    === 'string',  `${key}: area must be string`);
      assert.ok(typeof def.http    === 'number',  `${key}: http must be number`);
      assert.ok(typeof def.message === 'string',  `${key}: message must be string`);
      assert.ok(typeof def.retryable === 'boolean', `${key}: retryable must be boolean`);
    }
  });
});

describe('N42Error', () => {
  it('sets message, code, http, reason from errorDef', () => {
    const err = new N42Error(N42ErrorCode.FILE_NOT_FOUND, { details: 'invoice.xml' });
    assert.equal(err.name,    'N42Error');
    assert.equal(err.code,    N42ErrorCode.FILE_NOT_FOUND.code);
    assert.equal(err.http,    N42ErrorCode.FILE_NOT_FOUND.http);
    assert.equal(err.reason,  'File not found: invoice.xml');
    assert.equal(err.message, 'File not found: invoice.xml');
  });

  it('interpolates {details} placeholder', () => {
    const err = new N42Error(N42ErrorCode.CERT_NOT_FOUND, { details: 'ap.pem' });
    assert.ok(err.message.includes('ap.pem'));
  });

  it('leaves unresolved placeholders intact', () => {
    const err = new N42Error(N42ErrorCode.FILE_NOT_FOUND, {});
    assert.ok(err.message.includes('{details}'));
  });

  it('defaults retryable from errorDef', () => {
    const retryable = new N42Error(N42ErrorCode.DNS_ERROR);
    const notRetryable = new N42Error(N42ErrorCode.FILE_NOT_FOUND);
    assert.equal(retryable.retryable,    true);
    assert.equal(notRetryable.retryable, false);
  });

  it('overrides retryable via options', () => {
    const err = new N42Error(N42ErrorCode.DNS_ERROR, {}, { retryable: false });
    assert.equal(err.retryable, false);
  });

  it('sets url from options', () => {
    const err = new N42Error(N42ErrorCode.SERVER_ERROR, {}, { url: 'https://smp.example.com' });
    assert.equal(err.url, 'https://smp.example.com');
  });

  it('url defaults to null', () => {
    const err = new N42Error(N42ErrorCode.SERVER_ERROR);
    assert.equal(err.url, null);
  });

  it('is an instance of Error', () => {
    const err = new N42Error(N42ErrorCode.CRYPTO_FAILED);
    assert.ok(err instanceof Error);
  });

  it('pretty() returns a string containing code and message', () => {
    const err = new N42Error(N42ErrorCode.CERT_EXPIRED);
    const out = err.pretty();
    assert.ok(typeof out === 'string');
    assert.ok(out.includes(String(N42ErrorCode.CERT_EXPIRED.code)));
    assert.ok(out.includes('Certificate has expired'));
  });

  it('pretty() shows retry: no for non-retryable errors', () => {
    const err = new N42Error(N42ErrorCode.CERT_EXPIRED);
    assert.ok(err.pretty().includes('no'));
  });

  it('pretty() shows retry: yes for retryable errors', () => {
    const err = new N42Error(N42ErrorCode.DNS_ERROR);
    assert.ok(err.pretty().includes('yes'));
  });

  it('pretty() includes url when set', () => {
    const err = new N42Error(N42ErrorCode.SERVER_ERROR, {}, { url: 'https://ap.node42.dev' });
    assert.ok(err.pretty().includes('https://ap.node42.dev'));
  });
});