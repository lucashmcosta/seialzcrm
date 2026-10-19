import { routedCandidates, type OperationalConnection } from '../../supabase/functions/_shared/meta/operational';
export type MetaCapabilityState = 'active' | 'disabled' | 'connection_required' | 'asset_required' | 'permission_required';
type Asset = {connection_id:string; asset_type:string; selection_state:string};
type Route = {route:string; source:string; connection_id:string|null};
export function metaCapabilities(connections: OperationalConnection[], assets: Asset[], routes: Route[], enabled: boolean) {
  // Match the operational resolver used by publishing, moderation and Social.
  const candidates = routedCandidates(connections, routes.find(r => r.route === 'asset:page') ?? null);
  const conn = candidates.find(c => assets.some(a => a.connection_id === c.id && a.asset_type === 'page' && a.selection_state === 'selected'));
  const has = (type:string) => assets.some(a=>a.connection_id===conn?.id && a.asset_type===type && a.selection_state==='selected');
  const check = (asset:string, scopes:string[]): {state:MetaCapabilityState; missing:string[]} => {
    const missing = scopes.filter(scope=>!conn?.granted_scopes?.includes(scope));
    const state = !enabled ? 'disabled' : !candidates.length ? 'connection_required' : !conn || !has(asset) ? 'asset_required' : missing.length ? 'permission_required' : 'active';
    return {state,missing};
  };
  return {
    publishing: {facebook:check('page',['pages_read_engagement','pages_manage_posts']),instagram:check('instagram_account',['instagram_basic','instagram_content_publish'])},
    comments: {facebook:check('page',['pages_read_engagement','pages_read_user_content','pages_manage_engagement']),instagram:check('instagram_account',['instagram_basic','instagram_manage_comments'])},
    dm: {facebook:check('page',['pages_messaging']),instagram:check('instagram_account',['instagram_basic','instagram_manage_messages'])},
  };
}
