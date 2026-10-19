export function profileCacheFresh(row: {profile_page_id?: string; profile_refresh_after?: string} | null, pageId: string, now = Date.now()) {
  return row?.profile_page_id === pageId && Date.parse(row.profile_refresh_after ?? '') > now;
}
export function normalizeSocialProfile(platform: string, value: Record<string, any>) {
  const name = platform === 'messenger'
    ? [value.first_name,value.last_name].filter(Boolean).join(' ').trim()
    : value.name || value.username;
  return {
    name: name || null, avatar_url: value.profile_pic || null,
    username: value.username || null,
    profile_link: platform === 'instagram' && value.username ? `https://instagram.com/${value.username}` : null,
    ...(platform === 'instagram' ? {
      follower_count: value.follower_count ?? null, is_verified: !!value.is_verified_user,
      follows_us: !!value.is_user_follow_business, we_follow: !!value.is_business_follow_user,
    } : {}),
  };
}
