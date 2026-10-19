import { profileCacheFresh, normalizeSocialProfile } from '../supabase/functions/_shared/meta/social-profile.ts';
Deno.test('Messenger identity comes from first/last name and profile_pic', () => {
 const p=normalizeSocialProfile('messenger',{first_name:'Ana',last_name:'Silva',profile_pic:'https://example.test/photo'});
 if(p.name!=='Ana Silva'||!p.avatar_url||p.profile_link!==null)throw new Error('wrong profile');
});
Deno.test('profile cache is page scoped and expires', () => {
 const row={profile_page_id:'page1',profile_refresh_after:'2030-01-01'};
 if(!profileCacheFresh(row,'page1',0)||profileCacheFresh(row,'page2',0)||profileCacheFresh(row,'page1',Date.parse('2031-01-01')))throw new Error('unsafe cache');
});
