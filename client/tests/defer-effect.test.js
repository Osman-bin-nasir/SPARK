import test from 'node:test';
import assert from 'node:assert/strict';
import { deferEffect } from '../src/lib/defer-effect.js';
test('deferred effect cancels setup on immediate cleanup and disposes started work',async()=>{
  let runs=0,cleanups=0;
  const cancelled=deferEffect(()=>{runs++;});cancelled();await Promise.resolve();assert.equal(runs,0);
  const dispose=deferEffect(()=>{runs++;return()=>{cleanups++;};});
  assert.equal(runs,0);await Promise.resolve();assert.equal(runs,1);dispose();assert.equal(cleanups,1);
});
