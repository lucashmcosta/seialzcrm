\set ON_ERROR_STOP on
BEGIN;
\ir meta-review-base.sql
\ir ../../supabase/migrations/20261019190004_meta_media_dedup.sql
DO $$
DECLARE org uuid; other_org uuid; c uuid; c2 uuid; c3 uuid; m uuid; m2 uuid; n integer; v bigint;
BEGIN
  INSERT INTO organizations DEFAULT VALUES RETURNING id INTO org;
  INSERT INTO organizations DEFAULT VALUES RETURNING id INTO other_org;
  INSERT INTO meta_connections(organization_id) VALUES(org) RETURNING id INTO c;
  INSERT INTO meta_connections(organization_id) VALUES(org) RETURNING id INTO c2;
  INSERT INTO meta_media(organization_id,connection_id,platform,external_id,synced_at)
    VALUES(org,c,'facebook','same-post',now()-interval '1 day') RETURNING id INTO m;
  INSERT INTO meta_media_insights(organization_id,connection_id,media_id,reach,synced_at)
    VALUES(org,c,m,10,now()-interval '2 days'),(org,c,m,20,now()-interval '1 day'),(org,c,m,30,now());
  SELECT count(*), max(reach) INTO n,v FROM vw_meta_media_performance WHERE organization_id=org;
  ASSERT n=1 AND v=30, 'latest lifetime snapshot must win without summing';
  INSERT INTO meta_media(organization_id,connection_id,platform,external_id,synced_at)
    VALUES(org,c2,'facebook','same-post',now()) RETURNING id INTO m2;
  SELECT count(*) INTO n FROM vw_meta_media_performance WHERE organization_id=org;
  ASSERT n=1, 'duplicate authorizations must not duplicate the logical post';
  ASSERT (SELECT id=m2 AND NOT has_insights AND reach IS NULL FROM vw_meta_media_performance WHERE organization_id=org), 'missing insights remain NULL';
  INSERT INTO meta_connections(organization_id) VALUES(org) RETURNING id INTO c3;
  INSERT INTO meta_media(organization_id,connection_id,platform,external_id) VALUES(org,c3,'instagram','same-post');
  ASSERT (SELECT count(*)=2 FROM vw_meta_media_performance WHERE organization_id=org), 'platform identities remain independent';
  ASSERT (SELECT count(*)=3 FROM meta_media_insights), 'history must be preserved';
  PERFORM set_config('test.org',other_org::text,true);
END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN ASSERT (SELECT count(*)=0 FROM vw_meta_media_performance), 'view must honor organization RLS'; END $$;
ROLLBACK;
