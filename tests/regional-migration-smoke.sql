\set ON_ERROR_STOP on
BEGIN;

INSERT INTO public.organizations (id, name, slug, operating_country_code)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'Regional BR A', 'regional-br-a', 'BR'),
  ('10000000-0000-0000-0000-000000000002', 'Regional BR B', 'regional-br-b', 'BR'),
  ('10000000-0000-0000-0000-000000000003', 'Regional US', 'regional-us', 'US'),
  ('10000000-0000-0000-0000-000000000004', 'Legacy pending migration', 'regional-legacy', NULL);

INSERT INTO public.contacts (organization_id, full_name)
VALUES (
  '10000000-0000-0000-0000-000000000004',
  'Legacy contact remains writable during rollout'
);

INSERT INTO public.contacts (id, organization_id, full_name, cpf)
VALUES (
  '20000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000004',
  'Legacy contact with CPF',
  '529.982.247-25'
);

DO $$
BEGIN
  INSERT INTO public.contacts (organization_id, full_name, cpf)
  VALUES (
    '10000000-0000-0000-0000-000000000004',
    'Legacy duplicate CPF',
    '52998224725'
  );
  RAISE EXCEPTION 'duplicate CPF was accepted for a tenant awaiting regional configuration';
EXCEPTION
  WHEN unique_violation THEN
    IF SQLERRM NOT LIKE 'duplicate_cpf:%' THEN RAISE; END IF;
END;
$$;

INSERT INTO public.contacts (id, organization_id, full_name, cpf)
VALUES (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Maria da Silva',
  '529.982.247-25'
);

DO $$
DECLARE
  v_contact public.contacts%ROWTYPE;
BEGIN
  SELECT * INTO v_contact
  FROM public.contacts
  WHERE id = '20000000-0000-0000-0000-000000000001';

  IF v_contact.cpf <> '52998224725'
     OR v_contact.address_country_code <> 'BR'
     OR v_contact.first_name IS NOT NULL
     OR v_contact.last_name IS NOT NULL THEN
    RAISE EXCEPTION 'BR contact normalization failed';
  END IF;
END;
$$;

DO $$
BEGIN
  INSERT INTO public.contacts (organization_id, full_name, cpf)
  VALUES (
    '10000000-0000-0000-0000-000000000001',
    'CPF inválido',
    '529.982.247-24'
  );
  RAISE EXCEPTION 'invalid CPF was accepted';
EXCEPTION
  WHEN check_violation THEN
    IF SQLERRM <> 'invalid_cpf' THEN RAISE; END IF;
END;
$$;

DO $$
BEGIN
  INSERT INTO public.contacts (organization_id, full_name)
  VALUES (
    '10000000-0000-0000-0000-000000000003',
    'Incomplete US'
  );
  RAISE EXCEPTION 'US contact without name parts was accepted';
EXCEPTION
  WHEN check_violation THEN
    IF SQLERRM <> 'name_parts_required' THEN RAISE; END IF;
END;
$$;

INSERT INTO public.contacts (
  id, organization_id, full_name, first_name, last_name
)
VALUES (
  '20000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003',
  'Ignored',
  'Mary',
  'Smith'
);

DO $$
DECLARE
  v_full_name text;
  v_country text;
BEGIN
  SELECT full_name, address_country_code
    INTO v_full_name, v_country
  FROM public.contacts
  WHERE id = '20000000-0000-0000-0000-000000000002';

  IF v_full_name <> 'Mary Smith' OR v_country <> 'US' THEN
    RAISE EXCEPTION 'US contact canonical name failed';
  END IF;
END;
$$;

DO $$
BEGIN
  INSERT INTO public.contacts (organization_id, full_name, cpf)
  VALUES (
    '10000000-0000-0000-0000-000000000001',
    'CPF duplicado',
    '52998224725'
  );
  RAISE EXCEPTION 'duplicate CPF was accepted in the same tenant';
EXCEPTION
  WHEN unique_violation THEN
    IF SQLERRM NOT LIKE 'duplicate_cpf:%' THEN RAISE; END IF;
END;
$$;

INSERT INTO public.contacts (organization_id, full_name, cpf)
VALUES (
  '10000000-0000-0000-0000-000000000002',
  'Mesmo CPF em outro tenant',
  '52998224725'
);

INSERT INTO public.contact_identity_profiles (
  organization_id,
  contact_id,
  cpf_verification_status,
  cpf_registration_status,
  birth_date,
  mother_name,
  verification_provider,
  verification_provider_version,
  cpf_verified_at
)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'verified',
  'REGULAR',
  '1990-01-01',
  'Nome anterior',
  'cpf-brasil.org',
  'v2',
  now()
);

UPDATE public.contacts
SET cpf = '168.995.350-09'
WHERE id = '20000000-0000-0000-0000-000000000001';

DO $$
DECLARE
  v_profile public.contact_identity_profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile
  FROM public.contact_identity_profiles
  WHERE contact_id = '20000000-0000-0000-0000-000000000001';

  IF v_profile.cpf_verification_status <> 'unverified'
     OR v_profile.cpf_registration_status IS NOT NULL
     OR v_profile.birth_date IS NOT NULL
     OR v_profile.mother_name IS NOT NULL
     OR v_profile.verification_provider IS NOT NULL
     OR v_profile.cpf_verified_at IS NOT NULL THEN
    RAISE EXCEPTION 'CPF change did not reset verification state';
  END IF;
END;
$$;

INSERT INTO public.companies (organization_id, name, cnpj)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  'Empresa alfanumérica',
  '12abc34501de35'
);

DO $$
DECLARE
  v_cnpj text;
  v_country text;
BEGIN
  SELECT cnpj, address_country_code
    INTO v_cnpj, v_country
  FROM public.companies
  WHERE organization_id = '10000000-0000-0000-0000-000000000001';

  IF v_cnpj <> '12ABC34501DE35' OR v_country <> 'BR' THEN
    RAISE EXCEPTION 'CNPJ normalization failed';
  END IF;
END;
$$;

DO $$
BEGIN
  INSERT INTO public.companies (organization_id, name, cnpj)
  VALUES (
    '10000000-0000-0000-0000-000000000001',
    'Empresa duplicada',
    '12ABC34501DE35'
  );
  RAISE EXCEPTION 'duplicate CNPJ was accepted in the same tenant';
EXCEPTION
  WHEN unique_violation THEN NULL;
END;
$$;

DO $$
BEGIN
  INSERT INTO public.companies (organization_id, name, cnpj)
  VALUES (
    '10000000-0000-0000-0000-000000000003',
    'US company',
    '04.252.011/0001-10'
  );
  RAISE EXCEPTION 'CNPJ was accepted for a US tenant';
EXCEPTION
  WHEN check_violation THEN
    IF SQLERRM <> 'cnpj_only_available_for_br' THEN RAISE; END IF;
END;
$$;

ROLLBACK;
