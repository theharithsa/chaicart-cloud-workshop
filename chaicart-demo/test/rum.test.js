import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beginRumAction, withRumAction, rumEvent } from '../public/rum-actions.js';
test('RUM completes current API actions with valid flat fields and avoids nested actions', async()=>{
 const calls=[],events=[];
 globalThis.window={dynatrace:{userActions:{create(options){calls.push(options);return {complete(){calls.push('complete');}};}},sendEvent(event){events.push(event);}}};
 const result=await withRumAction('Submit Checkout',async()=>{await withRumAction('Nested Save',async()=>{});return 42;},{transaction_id:'test',total_value:100});
 assert.equal(result,42);assert.equal(calls.length,2);assert.equal(calls[0].customName,'Submit Checkout');
 assert.equal(events.length,1);assert.equal(events[0]['event_properties.outcome'],'success');assert.equal(events[0]['event_properties.total_value'],100);assert.equal(events[0].properties,undefined);
 delete globalThis.window;
});
test('RUM Classic actions finish exactly once and errors are rethrown unchanged', async()=>{
 const calls=[];globalThis.window={dtrum:{enterAction(name){calls.push(name);return 7;},leaveAction(id){calls.push(id);}}};
 const expected=Object.assign(new Error('private form text'),{code:'auth/popup-closed-by-user'});
 await assert.rejects(withRumAction('User Login',async()=>{throw expected;}),error=>error===expected);
 assert.deepEqual(calls,['User Login',7]);
 const action=beginRumAction('Save');action.end();action.end();assert.deepEqual(calls,['User Login',7,'Save',7]);delete globalThis.window;
});
test('missing and broken agents cannot prevent work or leak arbitrary properties',async()=>{
 delete globalThis.window;assert.equal(await withRumAction('Save',async()=>42),42);
 globalThis.window={dynatrace:{userActions:{create(){throw new Error('agent unavailable');}},sendEvent(){throw new Error('agent unavailable');}}};
 assert.equal(await withRumAction('Save',async()=>42),42);rumEvent('test',{body:'ignored by callers'});
 let captured;window.dynatrace.sendEvent=event=>{captured=event;};rumEvent('test',{body:'private answer',token:'secret',item_count:2});assert.equal(captured['event_properties.body'],undefined);assert.equal(captured['event_properties.token'],undefined);assert.equal(captured['event_properties.item_count'],2);delete globalThis.window;
});
test('active automatically detected action is renamed rather than duplicated',()=>{
 let completes=0;const current={state:'active',complete(){completes++;}};
 globalThis.window={dynatrace:{userActions:{current,create(){throw new Error('should not create');}}}};
 const action=beginRumAction('Award Reviewed Credits');assert.equal(current.customName,'Award Reviewed Credits');action.end();assert.equal(completes,1);delete globalThis.window;
});
