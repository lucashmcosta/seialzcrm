import {test,expect} from 'bun:test';
import {metaCapabilities} from '../src/lib/meta-capabilities';
test('capabilities follow the operational source, assets, expiry and individual grants',()=>{
  const old = {id:'system',status:'connected',activation_state:'ready',granted_scopes:['pages_read_engagement','pages_manage_posts','pages_messaging']};
  const newer = {...old,id:'oauth',activation_state:'pending',granted_scopes:['instagram_basic','instagram_content_publish']};
  const assets = [{connection_id:old.id,asset_type:'page',selection_state:'selected'},{connection_id:newer.id,asset_type:'instagram_account',selection_state:'selected'}];
  const routes = [{route:'asset:page',source:'canonical',connection_id:old.id}];
  const caps = metaCapabilities([newer,old],assets,routes,true);
  expect(caps.publishing.facebook.state).toBe('active');
  expect(caps.comments.facebook.missing).toContain('pages_manage_engagement');
  expect(caps.publishing.instagram.state).toBe('asset_required');
  expect(caps.dm.facebook.state).toBe('active');
  expect(metaCapabilities([old],assets,routes,false).dm.facebook.state).toBe('disabled');
  expect(metaCapabilities([{...old,expires_at:'2020-01-01'}],assets,routes,true).dm.facebook.state).toBe('connection_required');
  expect(metaCapabilities([{...old,id:'other'}],assets,routes,true).dm.facebook.state).toBe('connection_required');
});
