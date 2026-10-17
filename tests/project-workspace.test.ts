import test from 'node:test';
import assert from 'node:assert/strict';
import { cardInput, projectDetailsInput, projectProgress, projectCardGroups, filterCards, type BoardCard } from '../src/lib/board';
import { emptyBoardMemory, readBoardMemory, writeBoardMemory, changeBoardView } from '../src/lib/board-memory';
const project = '11111111-1111-4111-8111-111111111111';
const card = (id: string,patch: Partial<BoardCard> = {}): BoardCard => ({ ...cardInput.parse({ title:id }),id,user_id:'owner',status:'open',archived_at:null,created_at:'2026-10-17',updated_at:'2026-10-17',project_id:project,...patch });
test('Projects accept just a name, validate optional links and reject unsafe URLs',() => {
  assert.deepEqual(projectDetailsInput.parse({ name:'  Learn Rust  ' }),{ name:'Learn Rust',goal:'',description:'',repository_url:'',source_links:[] });
  for (const url of ['javascript:alert(1)','data:text/html,x','ftp://example.com','https://user:secret@example.com','not a URL']) {
    assert.equal(projectDetailsInput.safeParse({ name:'Project',repository_url:url }).success,false);
    assert.equal(cardInput.safeParse({ title:'Resource',url }).success,false);
  }
  assert.equal(projectDetailsInput.safeParse({ name:'Project',source_links:Array(21).fill('https://example.com') }).success,false);
  assert.equal(projectDetailsInput.safeParse({ name:' ',goal:'Something' }).success,false);
  assert.equal(projectDetailsInput.safeParse({ name:'Project',repository_url:'https://github.com/user/repo',source_links:['https://example.com/guide'] }).success,true);
});
test('Task progress follows project membership and completion, excluding archived and non-task cards',() => {
  const cards = [card('task',{type:'task'}),card('done',{type:'task',status:'completed'}),card('archive',{type:'task',status:'completed',archived_at:'2026-10-17'}),card('note'),card('other',{type:'task',project_id:null})];
  assert.deepEqual(projectProgress(cards,project),{ total:2,completed:1,percent:50 });
  assert.deepEqual(projectProgress([],project),{ total:0,completed:0,percent:0 });
  cards[0].status='completed'; assert.equal(projectProgress(cards,project).percent,100);
  cards[0].project_id=null; assert.equal(projectProgress(cards,project).total,1);
});
test('Project sections reuse each active card exactly once; resources and decisions remain searchable Board cards',() => {
  const cards=[card('task',{type:'task',format:'decision'}),card('link',{format:'link',url:'https://example.com/guide'}),card('snippet',{format:'code',body:'const x = 1;'}),card('choice',{format:'decision',body:'Simpler to maintain'}),card('idea',{type:'idea'}),card('problem',{type:'problem'}),card('archive',{format:'code',archived_at:'2026-10-17'}),card('general',{project_id:null})];
  const groups=projectCardGroups(cards,project);
  assert.deepEqual(groups.tasks.map(c=>c.id),['task']);
  assert.deepEqual(groups.resources.map(c=>c.id),['link','snippet']);
  assert.deepEqual(groups.decisions.map(c=>c.id),['choice']);
  assert.deepEqual(groups.notes.map(c=>c.id),['idea','problem']);
  assert.equal(new Set(Object.values(groups).flat().map(c=>c.id)).size,6);
  assert.deepEqual(filterCards(cards,{...emptyBoardMemory().filters,search:'example.com/guide'}).map(c=>c.id),['link']);
});
test('Board memory upgrades old drafts without losing filters, panels or scroll; account and project storage remain separate',() => {
  const values=new Map<string,string>(); const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
  const old={filters:{...emptyBoardMemory().filters,search:'Exam'},filtersOpen:true,projectsOpen:true,captureOpen:true,draft:{title:'Draft',body:'Keep this',type:'note',category:'',project_id:null,due_date:null},scrollY:720};
  storage.setItem('jobapply:board:a',JSON.stringify(old));
  const restored=readBoardMemory(storage,'a');
  assert.equal(restored.filters.search,'Exam');assert.equal(restored.scrollY,720);assert.equal(restored.captureOpen,true);assert.equal(restored.draft?.body,'Keep this');assert.equal(restored.surface,'cards');
  const projectMemory={...restored,surface:'projects' as const,projectSearch:'Rust',showArchivedProjects:true,projectPanels:{resources:true},capturePanelOpen:true};
  writeBoardMemory(storage,'a',projectMemory);writeBoardMemory(storage,'a:project:one',{...emptyBoardMemory(),scrollY:300});
  assert.deepEqual(readBoardMemory(storage,'a'),projectMemory);assert.equal(readBoardMemory(storage,'a:project:one').scrollY,300);assert.equal(readBoardMemory(storage,'b').scrollY,0);
  const next=changeBoardView(projectMemory,'general');assert.equal(next.draft?.body,'Keep this');assert.equal(next.projectSearch,'Rust');
});
test('An unfinished resource URL survives navigation as a draft but cannot be saved as a card',() => {
  const values=new Map<string,string>(); const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
  const memory={...emptyBoardMemory(),capturePanelOpen:true,draft:{...cardInput.parse({title:'Reference',format:'link'}),url:'https://'}};
  assert.equal(writeBoardMemory(storage,'owner',memory),true);
  const restored=readBoardMemory(storage,'owner');assert.equal(restored.draft?.url,'https://');assert.equal(cardInput.safeParse(restored.draft).success,false);
  assert.equal(cardInput.safeParse({...restored.draft,url:'https://example.com/guide'}).success,true);
});
