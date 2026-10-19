export function facebookCommentAuthor(from: {id?: string; name?: string; picture?: {data?: {url?: string}}} | null | undefined) {
  return { author: from?.name ?? '', author_id: from?.id ?? null, author_avatar_url: from?.picture?.data?.url ?? null };
}
