import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { templateDisplay } from './template-display.ts';
Deno.test('snapshot retains visual structure without private links or examples', () => {
  const result = templateDisplay([
    {type:'HEADER',format:'IMAGE',example:{header_handle:['secret']}},
    {type:'FOOTER',text:'Central Trabalhista'},
    {type:'BUTTONS',buttons:[{type:'URL',text:'Assinar',url:'https://sign.example/private',example:['secret']}]},
  ]);
  assertEquals(result,{footer:'Central Trabalhista',buttons:[{type:'URL',text:'Assinar'}]});
});
Deno.test('missing and malformed components retain a safe text fallback', () => {
  assertEquals(templateDisplay(null),{buttons:[]});
  assertEquals(templateDisplay([null,{type:'BUTTONS',buttons:[null,{}]}]),{buttons:[]});
});
Deno.test('static header is retained, unresolved dynamic header is omitted', () => {
  assertEquals(templateDisplay([{type:'HEADER',format:'TEXT',text:'Documento disponível'}]),{headerText:'Documento disponível',buttons:[]});
  assertEquals(templateDisplay([{type:'HEADER',format:'TEXT',text:'Olá {{1}}'}]),{buttons:[]});
});
