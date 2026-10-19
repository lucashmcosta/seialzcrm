import { routedCandidates } from '../supabase/functions/_shared/meta/operational.ts';
const old = {id:'system',status:'connected',activation_state:'ready',granted_scopes:['leads_retrieval']};
const oauth = {id:'oauth',status:'connected',activation_state:'ready',granted_scopes:[]};
function same(actual: unknown, expected: unknown) {if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error(JSON.stringify({actual,expected}));}
Deno.test('OAuth cannot displace a pinned operational connection', () => {
  same(routedCandidates([oauth,old],{source:'canonical',connection_id:'system'}).map(c=>c.id),['system']);
  same(routedCandidates([oauth,old],{source:'legacy',connection_id:null}),[]);
});
Deno.test('pending, expired and insufficient-scope authorizations are not operational', () => {
  same(routedCandidates([{...oauth,activation_state:'pending'}],null),[]);
  same(routedCandidates([{...old,expires_at:'2020-01-01'}],null),[]);
  same(routedCandidates([oauth,old],null,['leads_retrieval']).map(c=>c.id),['system']);
  same(routedCandidates([{...old,last_health:'error'},oauth],{source:'canonical',connection_id:'system'}),[]);
});
