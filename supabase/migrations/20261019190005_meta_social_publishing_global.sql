-- Separate the globally available inbox/posts/comments from the campaigns/webhooks pilot.
INSERT INTO public.feature_flags(name,description,is_enabled,organization_ids)
VALUES ('meta_social_publishing','Meta Social inbox, publishing and comments',true,'{}')
ON CONFLICT (name) DO UPDATE SET is_enabled=true, organization_ids='{}';
