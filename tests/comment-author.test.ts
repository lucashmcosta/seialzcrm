import {facebookCommentAuthor} from '../supabase/functions/_shared/meta/comment-author.ts';
Deno.test('Facebook author is preserved with or without a picture',()=>{
 const a=facebookCommentAuthor({id:'tester',name:'Test User'});
 if(a.author!=='Test User'||a.author_avatar_url!==null)throw new Error('lost name');
 if(facebookCommentAuthor(null).author!=='')throw new Error('invented author');
 if(facebookCommentAuthor({picture:{data:{url:'https://example.test/pic'}}}).author_avatar_url!=='https://example.test/pic')throw new Error('lost photo');
});
