import test from 'node:test';
import assert from 'node:assert/strict';
import { compilePattern, compileRoutes, matchRoute } from '../server/routes/router.ts';
import type { Route } from '../server/routes/router.ts';
import { routes } from '../server/routes/index.ts';

const noop = async () => {};

test('patterns bind named segments, restrict enumerated ones and never match across slashes', () => {
  const { regex, names } = compilePattern('/api/channels/:id/jobs/:jobId/files/:name');
  assert.deepEqual(names, ['id', 'jobId', 'name']);
  assert.ok(regex.test('/api/channels/tech/jobs/j1/files/video'));
  assert.equal(regex.test('/api/channels/tech/jobs/j1/files/video/extra'), false);
  assert.equal(regex.test('/api/channels/tech/jobs/j1/files'), false);
  const kinds = compilePattern('/api/:kind(research|scripts)/:resourceId').regex;
  assert.ok(kinds.test('/api/scripts/s1'));
  assert.equal(kinds.test('/api/bootstrap/s1'), false);
  assert.equal(compilePattern('/api/a.b').regex.test('/api/aXb'), false);
});

test('the first route whose method and pattern match wins; anything else is left to the caller', () => {
  const table = compileRoutes([
    { method: 'GET', pattern: '/api/channels/:id', handle: noop },
    { method: ['PUT', 'DELETE'], pattern: '/api/channels/:id', handle: noop },
    { method: 'GET', pattern: '/api/channels/:id/jobs', handle: noop },
  ] satisfies Route[]);
  assert.deepEqual(matchRoute(table, 'GET', '/api/channels/tech')?.params, { id: 'tech' });
  assert.equal(matchRoute(table, 'DELETE', '/api/channels/tech')?.route, table[1].route);
  assert.equal(matchRoute(table, 'POST', '/api/channels/tech'), undefined);
  assert.equal(matchRoute(table, 'GET', '/api/channels/tech/jobs/extra'), undefined);
  assert.equal(matchRoute(table, 'GET', '/api/channels'), undefined);
});

test('the Studio route table has no duplicate method and pattern pair', () => {
  const table = compileRoutes(routes);
  assert.ok(table.length >= 30);
  assert.throws(
    () => compileRoutes([...routes, { method: 'GET', pattern: '/api/bootstrap', handle: noop }]),
    /Rota duplicada: GET \/api\/bootstrap/,
  );
});

test('resource routes do not capture the fixed studio and creative paths', () => {
  const table = compileRoutes(routes);
  for (const path of ['/api/bootstrap', '/api/channels', '/api/creative/settings', '/api/config'])
    assert.doesNotMatch(matchRoute(table, 'GET', path)?.route.pattern ?? '', /:kind/, path);
  assert.match(matchRoute(table, 'GET', '/api/research')!.route.pattern, /:kind/);
  assert.equal(matchRoute(table, 'GET', '/api/unknown'), undefined);
});
