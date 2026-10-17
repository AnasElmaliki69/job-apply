import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeProvider } from '../src/components/theme-provider';
import { ThemeControl } from '../src/components/theme-control';
import { persistTheme, readTheme, resolveTheme, themeBootstrap, themePreference } from '../src/lib/theme';

test('Theme choices follow system by default, preserve explicit overrides and tolerate blocked storage',() => {
  for (const input of [null,undefined,'invalid','<script>','system']) assert.equal(themePreference(input),'system');
  assert.equal(resolveTheme('system',true),'dark'); assert.equal(resolveTheme('system',false),'light');
  assert.equal(resolveTheme('light',true),'light'); assert.equal(resolveTheme('dark',false),'dark');
  const values=new Map<string,string>();const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
  assert.equal(readTheme(storage),'system');assert.equal(persistTheme(storage,'dark'),true);assert.equal(readTheme(storage),'dark');
  const blocked={getItem(){throw Error('Blocked');},setItem(){throw Error('Blocked');}};
  assert.equal(readTheme(blocked),'system');assert.equal(persistTheme(blocked,'light'),false);
});
test('Pre-paint bootstrap resolves saved/device theme before hydration, including when storage is blocked',() => {
  for (const stored of [null,'system','light','dark','invalid']) for (const systemDark of [false,true]) {
    const root={dataset:{} as Record<string,string>,style:{} as Record<string,string>};
    runInNewContext(themeBootstrap,{localStorage:{getItem:()=>stored},window:{matchMedia:()=>({matches:systemDark})},document:{documentElement:root}});
    const expected=resolveTheme(themePreference(stored),systemDark);assert.equal(root.dataset.theme,expected);assert.equal(root.style.colorScheme,expected);
  }
  const root={dataset:{} as Record<string,string>,style:{} as Record<string,string>};
  runInNewContext(themeBootstrap,{localStorage:{getItem(){throw Error('Blocked');}},window:{matchMedia:()=>({matches:true})},document:{documentElement:root}});
  assert.equal(root.dataset.theme,'dark');
});
test('Theme control renders a labelled native select with a hydration-safe System default',() => {
  const html=renderToStaticMarkup(createElement(ThemeProvider,{children:createElement(ThemeControl)}));
  assert.match(html,/<select[^>]*aria-label="Color theme"/);assert.match(html,/<option value="light">Light/);assert.match(html,/<option value="dark">Dark/);assert.match(html,/<option value="system" selected="">System/);
  assert.doesNotMatch(html,/role="combobox"/);
});
function luminance(hex:string) {
  const rgb=[1,3,5].map(index=>parseInt(hex.slice(index,index+2),16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
}
function ratio(a:string,b:string) {const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
test('Light and charcoal palettes keep ordinary text, accents and status labels at readable contrast',() => {
  const css=readFileSync(new URL('../src/app/theme.css',import.meta.url),'utf8');
  for (const selector of [':root',':root[data-theme="dark"]']) {
    const block=css.slice(css.indexOf(selector+' {')).split('}')[0];
    const tokens=Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*(#[\da-fA-F]{6})/g)].map(match=>[match[1],match[2]]));
    for (const [foreground,background] of [['text-primary','surface'],['text-secondary','surface'],['text-muted','surface'],['text-muted','app-bg'],['text-primary','field-bg'],['accent-contrast','accent'],['accent-ink','accent-soft'],...['note','idea','task','reminder','problem','solution','error'].map(name=>[`${name}-ink`,`${name}-bg`])]) {
      const contrast=ratio(tokens[`--${foreground}`],tokens[`--${background}`]);
      assert.ok(contrast>=4.5,`${selector}: ${foreground} on ${background} is ${contrast.toFixed(2)}:1`);
    }
  }
});
test('Every existing native dropdown shares the field styling',() => {
  const root=new URL('../src/',import.meta.url);let total=0;
  function visit(folder:string) {
    for (const entry of readdirSync(folder,{withFileTypes:true})) {
      const path=join(folder,entry.name);if(entry.isDirectory())visit(path);else if(entry.name.endsWith('.tsx')) {
        const content=readFileSync(path,'utf8');
        for (const match of content.matchAll(/<select\b[^>]*>/g)) {total++;assert.match(match[0],/className="[^"]*\bfield\b/,path);}
      }
    }
  }
  visit(decodeURIComponent(root.pathname).replace(/^\/(\w:)/,'$1'));assert.ok(total>=15);
});
