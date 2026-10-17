import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Disclosure, Reveal } from '../src/components/disclosure';
import { createActionRunner, type ActionFeedback } from '../src/lib/action-feedback';
import { emptyBoardMemory, readBoardMemory, writeBoardMemory } from '../src/lib/board-memory';

test('Disclosure keeps animated content mounted but inert and hidden from assistive technology when closed',() => {
  const closed=renderToStaticMarkup(createElement(Disclosure,{label:'Move & more',id:'actions',open:false,children:createElement('input',{name:'project'})}));
  assert.match(closed,/type="button"/);assert.match(closed,/aria-expanded="false"/);assert.match(closed,/aria-controls="actions"/);
  assert.match(closed,/id="actions"[^>]*inert=""[^>]*aria-hidden="true"/);assert.match(closed,/name="project"/);
  const open=renderToStaticMarkup(createElement(Disclosure,{label:'Move & more',id:'actions',open:true,children:createElement('input',{name:'project'})}));
  assert.match(open,/aria-expanded="true"/);assert.match(open,/aria-hidden="false"/);assert.doesNotMatch(open,/inert=/);
  const filters=renderToStaticMarkup(createElement(Reveal,{open:false,id:'filters',children:createElement('button',null,'Search')}));
  assert.match(filters,/inert=""/);
});
test('Save feedback locks immediately, blocks duplicate requests, then reports success or recoverable error',async() => {
  const states:ActionFeedback[]=[];const act=createActionRunner(state=>states.push(state));let writes=0;let finish!:()=>void;
  const first=act(async()=>{writes++;await new Promise<void>(resolve=>{finish=resolve;});},'Saved.');
  assert.deepEqual(states,[{busy:true,error:'',notice:''}]);
  assert.equal(await act(async()=>{writes++;},'Duplicate'),false);assert.equal(writes,1);assert.equal(states.length,1);
  finish();assert.equal(await first,true);assert.deepEqual(states.at(-1),{busy:false,error:'',notice:'Saved.'});
  assert.equal(await act(async()=>{throw new Error('Connection lost. Try again.');},'Saved.'),false);
  assert.deepEqual(states.at(-1),{busy:false,error:'Connection lost. Try again.',notice:''});
  assert.equal(await act(async()=>{writes++;},'Retried.'),true);assert.equal(writes,2);
  assert.deepEqual(states.at(-1),{busy:false,error:'',notice:'Retried.'});
});
test('Card action panels round-trip alongside existing filters, project panels, drafts and scroll without leaking between accounts',() => {
  const values=new Map<string,string>();const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
  const memory={...emptyBoardMemory(),filters:{...emptyBoardMemory().filters,search:'Exam'},filtersOpen:true,cardPanels:{one:true,two:false},projectPanels:{resources:true},scrollY:640};
  assert.equal(writeBoardMemory(storage,'a',memory),true);assert.deepEqual(readBoardMemory(storage,'a'),memory);
  assert.deepEqual(readBoardMemory(storage,'b').cardPanels,{});
  const legacy={...memory} as Partial<typeof memory>;delete legacy.cardPanels;
  storage.setItem('jobapply:board:legacy',JSON.stringify(legacy));
  const restored=readBoardMemory(storage,'legacy');assert.deepEqual(restored.cardPanels,{});assert.equal(restored.scrollY,640);assert.equal(restored.filters.search,'Exam');
});
