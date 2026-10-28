import test from 'node:test';
import assert from 'node:assert/strict';
import { orderResearch } from '../shared/research-order.ts';

test('manual assessments sort research without presenting a market score or mutating saved order', () => {
  const rows = [{title:'Demanda alta',updatedAt:'2026-10-01',demandScore:90,competitionScore:80,feasibilityScore:20},{title:'Fácil de produzir',updatedAt:'2026-10-02',demandScore:40,competitionScore:10,feasibilityScore:95}];
  assert.equal(orderResearch(rows,'feasibility')[0].title,'Fácil de produzir');
  assert.equal(orderResearch(rows,'demand')[0].title,'Demanda alta');
  assert.equal(orderResearch(rows,'competition')[0].title,'Fácil de produzir');
  assert.equal(orderResearch(rows,'recent')[0].title,'Fácil de produzir');
  assert.equal(rows[0].title,'Demanda alta');
});
