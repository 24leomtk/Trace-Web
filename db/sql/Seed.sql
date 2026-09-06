-- ============================================================================
-- Chipatala Registry — DEVELOPMENT SEED DATA
-- ----------------------------------------------------------------------------
-- Run AFTER the Drizzle migration and (ideally) after
-- db/sql/Functions&Policies.sql.
--
-- IMPORTANT: connect as the migration/schema owner or a superuser — NOT as
-- app_user — otherwise the RLS policies will block these inserts.
--
--   psql "$DATABASE_URL" -f "db/sql/Functions&Policies.sql"
--   psql "$DATABASE_URL" -f "db/sql/Seed.sql"
--
-- Contents:
--   * Wipes ALL application tables (DEV ONLY)
--   * Clinical reference data: ICD-10 codes, formulary, EPI vaccines,
--     immunization schedule, standard treatment guidelines
--   * 5 hospitals across two districts (Lilongwe & Blantyre)
--   * 51 users + exactly one phone-provider account each:
--       seed_user_000  administrator (Registry Administration)
--       seed_user_001  country_admin
--       seed_user_002  district_admin (Blantyre)
--       seed_user_003  doctor (Kamuzu Central Hospital, Lilongwe)
--       seed_user_004  doctor (Queen Elizabeth Central Hospital, Blantyre)
--       seed_user_005..050  patients (23 Lilongwe / 23 Blantyre)
--     - Malawian phone numbers (+265 88x / 99x xxx xxx), marked verified
--     - Random throw-away e-mails (phone OTP is the real login method)
--   * 10–30 medical records per patient spanning all 16 record types
--   * Derived facts (diagnoses / prescriptions / immunizations) written
--     explicitly; the medical_records fact-population trigger is disabled
--     during the load and re-enabled afterwards (guarded if it doesn't exist)
--   * Record attachments, access grants and a realistic audit trail (actions)
--
-- Deterministic: setseed(42) makes every run produce identical data.
-- ============================================================================

begin;

-- Wipe everything (dev only!) ------------------------------------------------
truncate table
  public.actions,
  public.access_grants,
  public.record_attachments,
  public.medical_records,
  public.diagnoses,
  public.prescriptions,
  public.immunizations,
  public.standard_treatment_guidelines,
  public.immunization_schedule,
  public.diagnosis_codes,
  public.medication_codes,
  public.immunization_codes,
  public.hospitals,
  public.accounts,
  public.verifications,
  public.sessions,
  public.users
restart identity cascade;

select setseed(0.42);

-- Disable the derived-facts trigger for the load (it would duplicate the rows
-- we insert explicitly below). Guarded in case Functions&Policies.sql hasn't
-- been applied yet.
do $$
begin
  execute 'alter table public.medical_records disable trigger medical_records_populate_facts';
exception when others then
  null; -- trigger not installed; nothing to disable
end $$;

-- ============================================================================
-- HOSPITALS
-- ============================================================================
insert into public.hospitals (id, name, district, location, contact_phone) values
  ('00000000-0000-0000-0000-000000000001', 'Kamuzu Central Hospital',        'lilongwe', 'Area 1, Lilongwe',        '+2651751344'),
  ('00000000-0000-0000-0000-000000000002', 'Queen Elizabeth Central Hospital','blantyre','1st Floor, Bwaila Wing, Blantyre', '+2651875274'),
  ('00000000-0000-0000-0000-000000000003', 'Bwaila Hospital',                'lilongwe', 'Area 3, Likuni Road, Lilongwe', '+2651752047'),
  ('00000000-0000-0000-0000-000000000004', 'Ndirande Health Centre',         'blantyre', 'Ndirande Township, Blantyre', '+2651688212'),
  ('00000000-0000-0000-0000-000000000005', 'Likuni Mission Hospital',        'lilongwe', 'Likuni, Lilongwe',        '+2651762333');

-- ============================================================================
-- CLINICAL REFERENCE DATA
-- ============================================================================

-- ICD-10 diagnosis catalogue -------------------------------------------------
insert into public.diagnosis_codes (icd10_code, description, name, is_infectious, threat_level) values
  ('B50.9', 'Plasmodium falciparum malaria without complications',            'Falciparum malaria',      true,  'high'),
  ('A00',   'Cholera due to Vibrio cholerae 01, biovar cholerae',             'Cholera',                 true,  'critical'),
  ('A09',   'Diarrhoea and gastroenteritis of presumed infectious origin',    'Infective gastroenteritis', true,'moderate'),
  ('A16.9', 'Respiratory tuberculosis unspecified, bacteriologically unknown','Pulmonary tuberculosis',  true,  'high'),
  ('B24',   'Human immunodeficiency virus disease resulting in other conditions','HIV disease',         true,  'moderate'),
  ('B05.9', 'Measles without complication',                                   'Measles',                 true,  'critical'),
  ('A39.9', 'Meningococcal infection, unspecified',                           'Meningococcal disease',   true,  'critical'),
  ('A35',   'Other tetanus',                                                  'Tetanus',                 true,  'high'),
  ('A82.9', 'Rabies, unspecified',                                            'Rabies',                  true,  'critical'),
  ('A53.9', 'Syphilis, unspecified',                                          'Syphilis',                true,  'moderate'),
  ('A54.9', 'Gonococcal infection, unspecified',                              'Gonorrhoea',              true,  'moderate'),
  ('J06.9', 'Acute upper respiratory infection, unspecified',                 'Acute upper respiratory infection', true, 'none'),
  ('J18.9', 'Pneumonia, organism unspecified',                                'Pneumonia',               true,  'moderate'),
  ('N39.0', 'Urinary tract infection, site not specified',                    'Urinary tract infection', true,  'none'),
  ('J45',   'Asthma',                                                         'Asthma',                  false, 'none'),
  ('I10',   'Essential (primary) hypertension',                               'Hypertension',            false, 'none'),
  ('E11.9', 'Type 2 diabetes mellitus without complications',                 'Type 2 diabetes',         false, 'none'),
  ('I50.9', 'Heart failure, unspecified',                                     'Heart failure',           false, 'none'),
  ('K29.7', 'Gastritis, unspecified',                                         'Gastritis',               false, 'none'),
  ('K35.9', 'Acute appendicitis, unspecified',                                'Acute appendicitis',      false, 'none'),
  ('D64.9', 'Anaemia, unspecified',                                           'Anaemia',                 false, 'none'),
  ('L03.9', 'Cellulitis, unspecified',                                        'Cellulitis',              true,  'none'),
  ('B65.9', 'Schistosomiasis, unspecified',                                   'Schistosomiasis',         true,  'moderate'),
  ('B76.9', 'Hookworm disease, unspecified',                                  'Hookworm disease',        true,  'moderate'),
  ('C53.9', 'Malignant neoplasm of cervix uteri, unspecified',                'Cervical cancer',         false, 'none'),
  ('C50.9', 'Malignant neoplasm of breast, unspecified',                      'Breast cancer',           false, 'none'),
  ('F32.9', 'Depressive episode, unspecified',                                'Depression',              false, 'none'),
  ('F41.1', 'Generalized anxiety disorder',                                   'Generalized anxiety',     false, 'none'),
  ('F20.9', 'Schizophrenia, unspecified',                                     'Schizophrenia',           false, 'none'),
  ('S72.0', 'Fracture of neck of femur',                                      'Fracture of neck of femur', false,'none'),
  ('E66.9', 'Obesity, unspecified',                                           'Obesity',                 false, 'none'),
  ('M17.9', 'Gonarthrosis (osteoarthritis of knee), unspecified',             'Knee osteoarthritis',     false, 'none');

-- Formulary -------------------------------------------------------------------
insert into public.medication_codes (code, name, category) values
  ('AL_20_120',          'Artemether/Lumefantrine 20mg/120mg', 'Antimalarial'),
  ('SP_500_25',          'Sulfadoxine/Pyrimethamine 500mg/25mg','Antimalarial'),
  ('QUININE_INF',        'Quinine dihydrochloride IV infusion', 'Antimalarial'),
  ('PARACETAMOL_500',    'Paracetamol 500mg tablet',            'Analgesic'),
  ('IBUPROFEN_400',      'Ibuprofen 400mg tablet',              'NSAID'),
  ('MORPHINE_10',        'Morphine sulfate 10mg/mL injection',  'Opioid analgesic'),
  ('AMOXICILLIN_250',    'Amoxicillin 250mg capsule',           'Antibiotic'),
  ('CEFTRIAXONE_1G',     'Ceftriaxone 1g IM/IV injection',      'Antibiotic'),
  ('CLOXACILLIN_500',    'Cloxacillin 500mg capsule',           'Antibiotic'),
  ('COTRIMOXAZOLE_480',  'Cotrimoxazole 480mg tablet',          'Antibiotic'),
  ('CIPROFLOXACIN_500',  'Ciprofloxacin 500mg tablet',          'Antibiotic'),
  ('AZITHROMYCIN_500',   'Azithromycin 500mg tablet',           'Antibiotic'),
  ('METRONIDAZOLE_400',  'Metronidazole 400mg tablet',          'Antiprotozoal'),
  ('DOXYCYCLINE_100',    'Doxycycline 100mg capsule',           'Antibiotic'),
  ('BENZATHINE_PEN_2.4', 'Benzathine benzylpenicillin 2.4MU IM','Antibiotic'),
  ('ORS',                'Oral rehydration salts sachet',       'Rehydration'),
  ('ZINC_20',            'Zinc sulfate 20mg dispersible tablet','Supplement'),
  ('FERROUS_FOLATE',     'Ferrous sulfate + folic acid tablet', 'Supplement'),
  ('VITAMIN_A',          'Vitamin A 200,000 IU capsule',        'Supplement'),
  ('SALBUTAMOL_INH',     'Salbutamol inhaler 100mcg/puff',      'Respiratory'),
  ('BECLOMETHASONE_INH', 'Beclometasone inhaler 100mcg/puff',   'Respiratory'),
  ('HYDROCORT_100',      'Hydrocortisone 100mg IV injection',   'Steroid'),
  ('AMLODIPINE_5',       'Amlodipine 5mg tablet',               'Cardiovascular'),
  ('ATENOLOL_50',        'Atenolol 50mg tablet',                'Cardiovascular'),
  ('FUROSEMIDE_40',      'Furosemide 40mg tablet',              'Cardiovascular'),
  ('ENALAPRIL_10',       'Enalapril 10mg tablet',               'Cardiovascular'),
  ('METFORMIN_500',      'Metformin 500mg tablet',              'Endocrine'),
  ('GLIBENCLAMIDE_5',    'Glibenclamide 5mg tablet',            'Endocrine'),
  ('INSULIN_30_70',      'Insulin 30/70 mix 100IU/mL',          'Endocrine'),
  ('TLD',                'TDF/3TC/DTG fixed-dose combination',  'ARV'),
  ('INH_300',            'Isoniazid 300mg tablet',              'Anti-TB'),
  ('RHZE_TAB',           'RHZE fixed-dose combination tablet',  'Anti-TB'),
  ('FLUCONAZOLE_200',    'Fluconazole 200mg capsule',           'Antifungal'),
  ('MEBENDAZOLE_500',    'Mebendazole 500mg tablet',            'Anthelmintic'),
  ('PRAZIQUANTEL_600',   'Praziquantel 600mg tablet',           'Anthelmintic'),
  ('SERTRALINE_50',      'Sertraline 50mg tablet',              'Psychotropic'),
  ('AMITRIPTYLINE_25',   'Amitriptyline 25mg tablet',           'Psychotropic'),
  ('HALOPERIDOL_5',      'Haloperidol 5mg tablet',              'Psychotropic'),
  ('DIAZEPAM_5',         'Diazepam 5mg tablet',                 'Psychotropic'),
  ('PROMETHAZINE_25',    'Promethazine 25mg tablet',            'Antihistamine'),
  ('KETAMINE_50',        'Ketamine 50mg/mL injection',          'Anaesthetic'),
  ('LIDOCAINE_2',        'Lignocaine 2% injection',             'Anaesthetic'),
  ('ANTACID_SUSP',       'Magnesium/aluminium antacid suspension','Gastrointestinal');

-- EPI vaccine catalogue -------------------------------------------------------
insert into public.immunization_codes (vaccine_code, name) values
  ('BCG',       'BCG (tuberculosis)'),
  ('OPV',       'Oral polio vaccine'),
  ('IPV',       'Inactivated polio vaccine'),
  ('PENTA',     'Pentavalent (DTP-HepB-Hib)'),
  ('PCV13',     'Pneumococcal conjugate (PCV13)'),
  ('ROTAVIRUS', 'Rotavirus (Rotarix)'),
  ('MR',        'Measles-Rubella'),
  ('HPV',       'Human papillomavirus'),
  ('TT',        'Tetanus toxoid');

-- Malawi EPI schedule (recommended age in days per dose) ----------------------
insert into public.immunization_schedule (vaccine_code, dose_number, recommended_age_days) values
  ('BCG',       1,    0),
  ('OPV',       1,   42),
  ('OPV',       2,   70),
  ('OPV',       3,   98),
  ('IPV',       1,   42),
  ('IPV',       2,   98),
  ('PENTA',     1,   42),
  ('PENTA',     2,   70),
  ('PENTA',     3,   98),
  ('PCV13',     1,   42),
  ('PCV13',     2,   70),
  ('PCV13',     3,   98),
  ('ROTAVIRUS', 1,   42),
  ('ROTAVIRUS', 2,   70),
  ('MR',        1,  274),
  ('MR',        2,  548),
  ('HPV',       1, 3287),  -- ~9 years
  ('HPV',       2, 3467);  -- ~9 years + 6 months

-- Standard treatment guidelines ------------------------------------------------
insert into public.standard_treatment_guidelines (icd10_code, medication_code, is_first_line) values
  ('B50.9', 'AL_20_120',         true),
  ('B50.9', 'SP_500_25',         false),
  ('B50.9', 'QUININE_INF',       false),
  ('A00',   'ORS',               true),
  ('A00',   'DOXYCYCLINE_100',   true),
  ('A00',   'ZINC_20',           true),
  ('A09',   'ORS',               true),
  ('A09',   'ZINC_20',           true),
  ('A16.9', 'RHZE_TAB',          true),
  ('A16.9', 'INH_300',           false),
  ('B24',   'TLD',               true),
  ('B24',   'COTRIMOXAZOLE_480', false),
  ('B05.9', 'VITAMIN_A',         true),
  ('B05.9', 'PARACETAMOL_500',   true),
  ('A53.9', 'BENZATHINE_PEN_2.4',true),
  ('A54.9', 'CEFTRIAXONE_1G',    true),
  ('J06.9', 'PARACETAMOL_500',   true),
  ('J18.9', 'AMOXICILLIN_250',   true),
  ('J18.9', 'CEFTRIAXONE_1G',    false),
  ('N39.0', 'COTRIMOXAZOLE_480', true),
  ('N39.0', 'CIPROFLOXACIN_500', false),
  ('J45',   'SALBUTAMOL_INH',    true),
  ('J45',   'BECLOMETHASONE_INH',false),
  ('I10',   'AMLODIPINE_5',      true),
  ('I10',   'ATENOLOL_50',       false),
  ('E11.9', 'METFORMIN_500',     true),
  ('E11.9', 'GLIBENCLAMIDE_5',   false),
  ('I50.9', 'FUROSEMIDE_40',     true),
  ('I50.9', 'ENALAPRIL_10',      true),
  ('K29.7', 'ANTACID_SUSP',      true),
  ('K35.9', 'CEFTRIAXONE_1G',    true),
  ('D64.9', 'FERROUS_FOLATE',    true),
  ('L03.9', 'CLOXACILLIN_500',   true),
  ('L03.9', 'CIPROFLOXACIN_500', false),
  ('B65.9', 'PRAZIQUANTEL_600',  true),
  ('B76.9', 'MEBENDAZOLE_500',   true),
  ('F32.9', 'SERTRALINE_50',     true),
  ('F32.9', 'AMITRIPTYLINE_25',  false),
  ('F41.1', 'SERTRALINE_50',     true),
  ('F20.9', 'HALOPERIDOL_5',     true),
  ('S72.0', 'PARACETAMOL_500',   true),
  ('S72.0', 'IBUPROFEN_400',     false),
  ('M17.9', 'IBUPROFEN_400',     true),
  ('M17.9', 'PARACETAMOL_500',   true);

-- ============================================================================
-- STAFF USERS (administrator, country admin, district admin, 2 doctors)
-- ============================================================================
insert into public.users (
  id, name, email, email_verified, image, created_at, updated_at,
  phone_number, phone_number_verified, national_id, date_of_birth, sex, district,
  role, hospital_id, medical_license_no, emergency_info
) values
  ('seed_user_000', 'Chisomo Banda',
   'chisomo.banda.admin@example.com',
   false, null, now() - interval '430 days', now() - interval '430 days',
   '+265881110000', true, 'A00010000', date '1982-01-15', 'female', 'lilongwe',
   'administrator', null, null,
   jsonb_build_object('blood_type','O+','allergies', to_jsonb(ARRAY[]::text[]),
     'chronic_conditions', to_jsonb(ARRAY[]::text[]),
     'emergency_contact_name','Mphatso Banda','emergency_contact_phone','+265889002000',
     'organ_donor', false)),
  ('seed_user_001', 'Grace Nyirenda',
   'grace.nyirenda.4821@example.com',
   false, null, now() - interval '420 days', now() - interval '420 days',
   '+265881110001', true, 'G00012001', date '1985-03-12', 'female', 'lilongwe',
   'country_admin', null, null,
   jsonb_build_object('blood_type','O+','allergies', to_jsonb(ARRAY[]::text[]),
     'chronic_conditions', to_jsonb(ARRAY['Hypertension']),
     'emergency_contact_name','Yohane Nyirenda','emergency_contact_phone','+265889002001',
     'organ_donor', false)),
  ('seed_user_002', 'Patrick Kamanga',
   'patrick.kamanga.3390@example.com',
   false, null, now() - interval '410 days', now() - interval '410 days',
   '+265991110002', true, 'K00022002', date '1988-11-02', 'male', 'blantyre',
   'district_admin', null, null,
   jsonb_build_object('blood_type','A+','allergies', to_jsonb(ARRAY[]::text[]),
     'chronic_conditions', to_jsonb(ARRAY[]::text[]),
     'emergency_contact_name','Alinafe Kamanga','emergency_contact_phone','+265889002002',
     'organ_donor', false)),
  ('seed_user_003', 'Chikumbutso Phiri',
   'chikumbutso.phiri.9174@example.com',
   false, null, now() - interval '400 days', now() - interval '400 days',
   '+265881110003', true, 'P00033003', date '1984-06-21', 'male', 'lilongwe',
   'doctor', '00000000-0000-0000-0000-000000000001', 'MMCN-2011-0487',
   jsonb_build_object('blood_type','B+','allergies', to_jsonb(ARRAY[]::text[]),
     'chronic_conditions', to_jsonb(ARRAY[]::text[]),
     'emergency_contact_name','Tiwonge Phiri','emergency_contact_phone','+265889002003',
     'organ_donor', true)),
  ('seed_user_004', 'Thandiwe Mvula',
   'thandiwe.mvula.2065@example.com',
   false, null, now() - interval '395 days', now() - interval '395 days',
   '+265991110004', true, 'M00044004', date '1989-09-14', 'female', 'blantyre',
   'doctor', '00000000-0000-0000-0000-000000000002', 'MMCN-2015-1120',
   jsonb_build_object('blood_type','O-','allergies', to_jsonb(ARRAY['Penicillin']),
     'chronic_conditions', to_jsonb(ARRAY[]::text[]),
     'emergency_contact_name','Madalitso Mvula','emergency_contact_phone','+265889002004',
     'organ_donor', false));

-- ============================================================================
-- PATIENTS (46 users from Lilongwe & Blantyre)
-- ============================================================================
do $$
declare
  male_names   text[] := ARRAY['Yamikani','Limbani','Kondwani','Pemphero','Blessings','Gift','Peter','James','John','Joseph','Isaac','Daniel','Elias','Frank','Charles','Moses','Aaron','Vincent','Patrick','Yohane','Hastings','McDonald','Chimwemwe','Madalitso','Tapiwa'];
  female_names text[] := ARRAY['Thandiwe','Tiwonge','Zione','Memory','Esnath','Grace','Mary','Esther','Ruth','Naomi','Alice','Fanny','Chrissy','Modester','Alinafe','Tadala','Wezzie','Chikumbutso','Tamandani','Chikondi','Chifundo','Dalitso','Mphatso','Fatsani','Thandi'];
  surnames     text[] := ARRAY['Banda','Phiri','Chirwa','Mwale','Nkhoma','Zimba','Gondwe','Chilenje','Kalua','Nyirenda','Kamanga','Sibale','Mvula','Kaunda','Mkandawire','Njobvu','Chavula','Kondowe','Mughogho','Msiska','Munthali','Chisi','Kachala','Thombozi','Chiwaya','Kumwenda','Ngwira','Harawa','Chaima','Jere','Lungu','Moyo','Maulidi','Chiotha','Kanyemba','Buleya','Mtegha','Masamba','Kholowa','Nyasulu'];
  blood_types  text[] := ARRAY['O+','A+','B+','O-','AB+','A-'];
  allergy_pool text[] := ARRAY['Penicillin','Sulfa drugs','Aspirin','Peanuts','Shellfish','Dust mites','Pollen','Iodine contrast'];
  chronic_pool text[] := ARRAY['Hypertension','Type 2 diabetes','Asthma','HIV','Epilepsy','Sickle cell disease','Chronic kidney disease'];

  i int;
  r_sex sex;
  r_first text;
  r_last text;
  r_district district;
  v_age int;
  v_dob date;
  v_created timestamptz;
  v_allergies text[];
  v_chronic text[];
  v_meds text[];
begin
  for i in 5..50 loop
    if i % 17 = 0 then
      r_sex := 'other';
    elsif i % 2 = 0 then
      r_sex := 'female';
    else
      r_sex := 'male';
    end if;

    if r_sex = 'male' then
      r_first := male_names[1 + ((i * 5) % array_length(male_names, 1))];
    else
      r_first := female_names[1 + ((i * 5) % array_length(female_names, 1))];
    end if;
    r_last := surnames[1 + ((i * 11) % array_length(surnames, 1))];

    r_district := case when i % 2 = 1 then 'lilongwe' else 'blantyre' end;

    v_age := 18 + floor(random() * 55)::int;
    v_dob := current_date - make_interval(years => v_age, days => floor(random() * 365)::int);
    v_created := now() - make_interval(days => 30 + floor(random() * 330)::int);

    -- allergies: 0–2 entries
    if random() < 0.35 then
      v_allergies := ARRAY[allergy_pool[1 + floor(random() * 8)::int]];
      if random() < 0.3 then
        v_allergies := v_allergies || allergy_pool[1 + floor(random() * 8)::int];
      end if;
    else
      v_allergies := ARRAY[]::text[];
    end if;

    -- chronic conditions: occasional single condition + matching meds
    if random() < 0.28 then
      v_chronic := ARRAY[chronic_pool[1 + floor(random() * 7)::int]];
      v_meds :=
        case v_chronic[1]
          when 'Hypertension'            then ARRAY['Amlodipine 5mg OD']
          when 'Type 2 diabetes'         then ARRAY['Metformin 500mg BD']
          when 'Asthma'                  then ARRAY['Salbutamol inhaler PRN']
          when 'HIV'                     then ARRAY['TLD (ART), monthly refills']
          when 'Epilepsy'                then ARRAY['Carbamazepine 200mg BD']
          when 'Sickle cell disease'     then ARRAY['Folic acid 5mg OD']
          else ARRAY['Follow-up at clinic']
        end;
    else
      v_chronic := ARRAY[]::text[];
      v_meds := ARRAY[]::text[];
    end if;

    insert into public.users (
      id, name, email, email_verified, image, created_at, updated_at,
      phone_number, phone_number_verified, national_id, date_of_birth, sex, district,
      role, hospital_id, medical_license_no, emergency_info
    ) values (
      'seed_user_' || lpad(i::text, 3, '0'),
      r_first || ' ' || r_last,
      lower(r_first) || '.' || lower(r_last) || i::text || floor(random() * 9000 + 1000)::text || '@example.com',
      false,
      null,
      v_created,
      v_created,
      -- Malawian mobile: +265 followed by 88x/99x and 7 digits
      '+265' || case when i % 3 = 0 then '99' else '88' end || lpad(((i * 137 + 3100000))::text, 7, '0'),
      true,
      substr(r_last, 1, 1) || lpad((((i * 104729) + 13) % 100000000)::text, 8, '0'),
      v_dob,
      r_sex,
      r_district,
      'patient',
      null,
      null,
      jsonb_build_object(
        'blood_type', blood_types[1 + (i % 6)],
        'allergies', to_jsonb(v_allergies),
        'chronic_conditions', to_jsonb(v_chronic),
        'current_medications', to_jsonb(v_meds),
        'emergency_contact_name',
          case when r_sex = 'female' then 'Yamikani ' || r_last else 'Tiwonge ' || r_last end,
        'emergency_contact_phone', '+26588' || lpad(((i * 911 + 5200000))::text, 7, '0'),
        'organ_donor', random() < 0.15
      )
    );
  end loop;
end $$;

-- ============================================================================
-- AUTH ACCOUNTS (one phone-provider account per user; no sessions/verifications)
-- ============================================================================
insert into public.accounts (id, issuer, account_id, provider_id, user_id, created_at, updated_at)
select
  'seed_account_' || lpad((row_number() over (order by u.created_at))::text, 3, '0'),
  'phone',
  u.phone_number,
  'phone',
  u.id,
  u.created_at,
  u.created_at
from public.users u;

-- ============================================================================
-- MEDICAL RECORDS + DERIVED FACTS
-- 10–30 records per patient (childhood immunisations count towards the total)
-- ============================================================================
do $$
declare
  wt text[] := ARRAY[
    'outpatient_visit','outpatient_visit','outpatient_visit','outpatient_visit',
    'lab_test_result','lab_test_result','lab_test_result',
    'medication_prescription','medication_prescription','medication_prescription',
    'emergency_visit','emergency_visit',
    'nursing_notes','nursing_notes',
    'screening_test','screening_test',
    'inpatient_admission','discharge_summary','referral_record',
    'intake_output_chart','medication_administration','imaging_report',
    'surgical_procedure','psychiatric_evaluation','pathology_report'
  ];

  odx_pool text[] := ARRAY['B50.9','A09','J06.9','N39.0','J45','I10','E11.9','K29.7','D64.9','B65.9','B76.9','L03.9','B24','M17.9','E66.9'];
  adm_pool text[] := ARRAY['J18.9','B50.9','I50.9','K35.9','S72.0','A16.9','A00'];
  path_pool text[] := ARRAY['C53.9','C50.9'];
  psy_pool text[] := ARRAY['F32.9','F41.1','F20.9'];
  rx_pool text[] := ARRAY['B50.9','A09','J06.9','J18.9','N39.0','J45','I10','E11.9','K29.7','D64.9','B65.9','B76.9','L03.9','B24','A16.9','A00','F32.9','I50.9','M17.9'];

  sched_v text[]    := ARRAY['BCG','OPV','OPV','OPV','IPV','IPV','PENTA','PENTA','PENTA','PCV13','PCV13','PCV13','ROTAVIRUS','ROTAVIRUS','MR','MR'];
  sched_d int[]     := ARRAY[1,1,2,3,1,2,1,2,3,1,2,3,1,2,1,2];
  sched_days int[]  := ARRAY[0,42,70,98,42,98,42,70,98,42,70,98,42,70,274,548];

  pat record;
  k int;
  n int;

  v_type text;
  v_rdate date;
  v_cts timestamptz;
  v_recid uuid;
  v_data jsonb;

  v_doc text;
  v_hosp uuid;
  v_docname text;

  v_dx text;
  v_dxname text;
  v_dxdesc text;
  v_duuid uuid;
  v_puuid uuid;
  v_iuuid uuid;

  v_yrs int;
  v_band text;
  v_tmp int;
  v_txt text;
  v_txt2 text;
  v_num numeric;

  -- immunisation cohort state
  v_imm_count int;
  v_take int;
  v_adate date;

  -- prescription builder state
  v_med text;
  v_meds_arr text[];
  v_dose text;
  v_route route;
  v_freq text;
  v_dur text;
  v_qty int;

  v_imm_hosp uuid;
begin
  for pat in
    select id, name, district, date_of_birth, sex
    from public.users where role = 'patient'
    order by id
  loop
    -- attending doctor/hospital (85% own-district team)
    if random() < 0.85 then
      if pat.district = 'lilongwe' then
        v_doc := 'seed_user_003'; v_hosp := '00000000-0000-0000-0000-000000000001';
      else
        v_doc := 'seed_user_004'; v_hosp := '00000000-0000-0000-0000-000000000002';
      end if;
    else
      if pat.district = 'lilongwe' then
        v_doc := 'seed_user_004'; v_hosp := '00000000-0000-0000-0000-000000000002';
      else
        v_doc := 'seed_user_003'; v_hosp := '00000000-0000-0000-0000-000000000001';
      end if;
    end if;
    select name into v_docname from public.users where id = v_doc;
    select case when pat.district = 'lilongwe'
      then '00000000-0000-0000-0000-000000000003'::uuid
      else '00000000-0000-0000-0000-000000000004'::uuid end
      into v_imm_hosp;

    v_imm_count := 0;

    -- ------------------------------------------------------------------
    -- Childhood immunisation history for patients aged <= 36
    -- ------------------------------------------------------------------
    if pat.date_of_birth >= date '1990-01-01' then
      v_take := 5 + floor(random() * 8)::int;  -- 5..12 doses
      for k in 1..least(v_take, array_length(sched_v, 1)) loop
        v_adate := pat.date_of_birth + sched_days[k];
        continue when v_adate > current_date;
        v_iuuid := gen_random_uuid();
        v_txt := case sched_v[k]
          when 'BCG' then 'BCG (tuberculosis)'
          when 'OPV' then 'Oral polio vaccine'
          when 'IPV' then 'Inactivated polio vaccine'
          when 'PENTA' then 'Pentavalent (DTP-HepB-Hib)'
          when 'PCV13' then 'Pneumococcal conjugate (PCV13)'
          when 'ROTAVIRUS' then 'Rotavirus (Rotarix)'
          when 'MR' then 'Measles-Rubella'
          else 'Human papillomavirus'
        end;
        v_txt2 := case sched_v[k]
          when 'OPV' then 'Bio Farma'
          when 'MR' then 'Serum Institute of India'
          when 'IPV' then 'GlaxoSmithKline'
          when 'PCV13' then 'Pfizer'
          when 'ROTAVIRUS' then 'GlaxoSmithKline'
          else 'Serum Institute of India'
        end;
        v_data := jsonb_build_object(
          'immunization_id', v_iuuid,
          'vaccine_code', sched_v[k],
          'vaccine', v_txt,
          'dose_number', sched_d[k],
          'manufacturer', v_txt2,
          'administered_at', to_char(v_adate, 'YYYY-MM-DD')
        );
        insert into public.medical_records
          (profile_id, hospital_id, created_by, record_type, record_date, data, created_at, updated_at)
        values
          (pat.id, v_imm_hosp, v_doc, 'immunization_record', v_adate, v_data,
           v_adate::timestamptz + interval '9 hours', v_adate::timestamptz + interval '9 hours')
        returning id into v_recid;
        insert into public.immunizations
          (id, record_id, profile_id, vaccine_code, dose_number, manufacturer,
           hospital_id, district, administered_at, created_at)
        values
          (v_iuuid, v_recid, pat.id, sched_v[k], sched_d[k], v_txt2,
           v_imm_hosp, pat.district, v_adate, v_adate::timestamptz + interval '9 hours');
        v_imm_count := v_imm_count + 1;
      end loop;

      -- HPV catch-up for young adult women
      if pat.sex = 'female'
         and extract(year from age(current_date, pat.date_of_birth))::int between 18 and 26 then
        for k in 1..2 loop
          v_adate := pat.date_of_birth + (3400 + floor(random() * 120)::int) + (k - 1) * 180;
          continue when v_adate > current_date;
          v_iuuid := gen_random_uuid();
          v_data := jsonb_build_object(
            'immunization_id', v_iuuid,
            'vaccine_code', 'HPV',
            'vaccine', 'Human papillomavirus',
            'dose_number', k,
            'manufacturer', 'GlaxoSmithKline',
            'administered_at', to_char(v_adate, 'YYYY-MM-DD')
          );
          insert into public.medical_records
            (profile_id, hospital_id, created_by, record_type, record_date, data, created_at, updated_at)
          values
            (pat.id, v_imm_hosp, v_doc, 'immunization_record', v_adate, v_data,
             v_adate::timestamptz + interval '10 hours', v_adate::timestamptz + interval '10 hours')
          returning id into v_recid;
          insert into public.immunizations
            (id, record_id, profile_id, vaccine_code, dose_number, manufacturer,
             hospital_id, district, administered_at, created_at)
          values
            (v_iuuid, v_recid, pat.id, 'HPV', k, 'GlaxoSmithKline',
             v_imm_hosp, pat.district, v_adate, v_adate::timestamptz + interval '10 hours');
          v_imm_count := v_imm_count + 1;
        end loop;
      end if;
    end if;

    -- ------------------------------------------------------------------
    -- General clinical records: keep grand total within 10..30
    -- ------------------------------------------------------------------
    v_tmp := 10 + floor(random() * 21)::int;                       -- target total
    n := greatest(v_tmp - v_imm_count, 10 - v_imm_count, 0);       -- at least 10 overall
    n := least(n, 30 - v_imm_count);                               -- at most 30 overall

    for k in 1..n loop
      v_type := wt[(1 + floor(random() * array_length(wt, 1)))::int];
      v_rdate := current_date - floor(random() * 700)::int;        -- past ~2 years
      if k = n then
        v_rdate := current_date - floor(random() * 30)::int;       -- one recent record
      end if;
      v_cts := v_rdate::timestamptz + make_interval(hours => 7 + floor(random() * 10)::int, mins => floor(random() * 60)::int);
      v_duuid := null;
      v_puuid := null;
      v_yrs := extract(year from age(v_rdate, pat.date_of_birth))::int;
      v_band := case
        when v_yrs < 5 then '0-4'
        when v_yrs < 15 then '5-14'
        when v_yrs < 25 then '15-24'
        when v_yrs < 45 then '25-44'
        when v_yrs < 65 then '45-64'
        else '65+' end;

      -- ================================================================
      if v_type = 'outpatient_visit' then
        -- ==============================================================
        v_dx := odx_pool[(1 + floor(random() * array_length(odx_pool, 1)))::int];
        select d.name, d.description into v_dxname, v_dxdesc
          from public.diagnosis_codes d where d.icd10_code = v_dx;
        v_duuid := gen_random_uuid();
        v_data := jsonb_build_object(
          'diagnosis_id', v_duuid,
          'icd10_code', v_dx,
          'visit_type', 'OUTPATIENT',
          'chief_complaint', case v_dx
            when 'B50.9' then 'Fever, headache and body pains'
            when 'A09' then 'Diarrhoea and vomiting'
            when 'J06.9' then 'Cough, sore throat and runny nose'
            when 'N39.0' then 'Burning sensation when passing urine'
            when 'J45' then 'Recurrent wheezing and night-time cough'
            when 'I10' then 'Routine blood pressure review'
            when 'E11.9' then 'Routine diabetes review; increased thirst'
            when 'K29.7' then 'Upper abdominal pain after meals'
            when 'D64.9' then 'Fatigue, dizziness and shortness of breath on exertion'
            when 'B65.9' then 'Abdominal pain and bloody stool'
            when 'B76.9' then 'Abdominal discomfort, noticed worms in stool'
            when 'L03.9' then 'Painful spreading redness on the lower leg'
            when 'B24' then 'Routine HIV care and viral load review'
            when 'M17.9' then 'Both knees painful, worse on stairs'
            when 'E66.9' then 'Advice on weight management'
            else 'General feeling of being unwell'
          end,
          'history_of_present_illness',
            (1 + floor(random() * 10))::int::text ||
            '-day history of progressively worsening symptoms. No chest pain, no night sweats. Eating and sleeping are disturbed by the symptoms.',
          'physical_exam', jsonb_build_object(
            'bp', (105 + floor(random() * 40))::int || '/' || (65 + floor(random() * 25))::int || ' mmHg',
            'pulse', (58 + floor(random() * 45))::int || ' bpm',
            'temperature', round((36.2 + random() * 2.1)::numeric, 1) || ' °C'),
          'assessment', v_dxdesc,
          'plan', case v_dx
            when 'B50.9' then 'Confirm with malaria RDT; start artemether/lumefantrine, advise adherence and review in 3 days.'
            when 'A09' then 'ORS and zinc supplementation, hygiene counselling, return if unable to drink.'
            when 'N39.0' then 'Urine m/c/s sent; empirical cotrimoxazole, encourage fluids.'
            when 'I10' then 'Continue amlodipine 5mg OD, salt reduction advice, BP chart kept at home.'
            when 'E11.9' then 'Continue metformin, RBS monitoring, foot care education.'
            else 'Symptomatic treatment, health education and follow-up if not improving within 48 hours.'
          end
        );
        insert into public.medical_records
          (profile_id, hospital_id, created_by, record_type, record_date, data, created_at, updated_at)
        values
          (pat.id, v_hosp, v_doc, 'outpatient_visit', v_rdate, v_data, v_cts, v_cts + interval '40 minutes')
        returning id into v_recid;
        insert into public.diagnoses
          (id, record_id, profile_id, icd10_code, hospital_id, district, age_band, sex,
           notes, severity, diagnosed_at, created_at)
        values
          (v_duuid, v_recid, pat.id, v_dx, v_hosp, pat.district, v_band, pat.sex,
           v_dxdesc, null, v_rdate, v_cts);

      -- ================================================================
      elsif v_type = 'emergency_visit' then
        -- ==============================================================
        v_num := random();
        v_data := jsonb_build_object(
          'visit_type', 'EMERGENCY',
          'arrival_mode', (ARRAY['Ambulance','Police escort','Private vehicle','Walk-in'])[(1 + floor(random() * 4))::int],
          'triage_level', case when v_num < 0.2 then 'RED' when v_num < 0.7 then 'YELLOW' else 'GREEN' end,
          'presenting_symptoms', to_jsonb(ARRAY[
            (ARRAY['Chest pain','Shortness of breath','Severe headache','Loss of consciousness','High fever','Deep cut to forearm','Suspected fracture','Severe abdominal pain'])[(1 + floor(random() * 8))::int],
            (ARRAY['Vomiting','Dizziness','Pallor','Sweating','Confusion','Weakness on one side'])[(1 + floor(random() * 6))::int]
          ]),
          'initial_interventions', to_jsonb(ARRAY[
            (ARRAY['IV access secured','Oxygen via face mask','Wound cleaning and dressing','IV fluids started','Paracetamol given','Blood samples taken'])[(1 + floor(random() * 6))::int],
            'Continuous vital signs monitoring'
          ])
        );
        insert into public.medical_records
          (profile_id, hospital_id, created_by, record_type, record_date, data, created_at, updated_at)
        values
          (pat.id, v_hosp, v_doc, 'emergency_visit', v_rdate, v_data, v_cts, v_cts + interval '2 hours')
        returning id into v_recid;

      -- ================================================================
      elsif v_type = 'inpatient_admission' then
        -- ==============================================================
        v_dx := adm_pool[(1 + floor(random() * array_length(adm_pool, 1)))::int];
        select d.name into v_dxname from public.diagnosis_codes d where d.icd10_code = v_dx;
        v_data := jsonb_build_object(
          'admission_reason', 'Admitted for management of ' || lower(coalesce(v_dxname, 'acute illness')) || '.',
          'admission_date', to_char(v_rdate, 'YYYY-MM-DD'),
          'ward', (ARRAY['Male Medical Ward','Female Medical Ward','Casualty Observation','Adult High Dependency Unit'])[(1 + floor(random() * 4))::int],
          'bed_number', chr(65 + floor(random() * 6)::int) || '-' || (1 + floor(random() * 18))::int::text,
          'attending_physician', v_docname
        );
        insert into public.medical_records
          (profile_id, hospital_id, created_by, record_type, record_date, data, created_at, updated_at)
        values
          (pat.id, v_hosp, v_doc, 'inpatient_admission', v_rdate, v_data, v_cts, v_cts)
        returning id into v_recid;

      -- ================================================================
      elsif v_type = 'lab_test_result' then
        -- ==============================================================
        v_tmp := (1 + floor(random() * 6))::int;
        v_data := jsonb_build_object(
          'test_name', case v_tmp
            when 1 then 'Full blood count'
            when 2 then 'Malaria rapid diagnostic test (RDT)'
            when 3 then 'Random blood sugar'
            when 4 then 'HIV rapid test (Determine)'
            when 5 then 'Urine microscopy, culture and sensitivity'
            else 'Sputum GeneXpert MTB/RIF'
          end,
          'specimen', case v_tmp
            when 1 then 'EDTA whole blood'
            when 2 then 'Finger-prick blood'
            when 3 then 'Fluoride oxalate plasma'
            when 4 then 'Capillary whole blood'
            when 5 then 'Midstream urine'
            else 'Sputum spot sample'
          end,
          'results', case v_tmp
            when 1 then jsonb_build_array(
              jsonb_build_object('parameter','Haemoglobin','value', round((7 + random() * 8)::numeric, 1),'unit','g/dL','reference_range','12.0-16.0'),
              jsonb_build_object('parameter','WBC','value', round((3.5 + random() * 9)::numeric, 1),'unit','×10⁹/L','reference_range','4.0-11.0'),
              jsonb_build_object('parameter','Platelets','value', (90 + floor(random() * 260))::int::text,'unit','×10⁹/L','reference_range','150-450'))
            when 2 then jsonb_build_array(
              jsonb_build_object('parameter','P. falciparum antigen','value', case when random() < 0.55 then 'Positive' else 'Negative' end,'unit','-','reference_range','Negative'))
            when 3 then jsonb_build_array(
              jsonb_build_object('parameter','Glucose (random)','value', round((3.8 + random() * 8.5)::numeric, 1),'unit','mmol/L','reference_range','3.9-7.8'))
            when 4 then jsonb_build_array(
              jsonb_build_object('parameter','HIV-1/2 antibodies','value', case when random() < 0.08 then 'Reactive' else 'Non-reactive' end,'unit','-','reference_range','Non-reactive'))
            when 5 then jsonb_build_array(
              jsonb_build_object('parameter','Pus cells','value', case when random() < 0.5 then '<5 /HPF' else '>20 /HPF' end,'unit','/HPF','reference_range','<5'),
              jsonb_build_object('parameter','Culture','value', case when random() < 0.5 then 'No growth after 48h' else 'Escherichia coli' end,'unit','-','reference_range','No growth'))
            else jsonb_build_array(
              jsonb_build_object('parameter','MTB detected','value', case when random() < 0.15 then 'Detected' else 'Not detected' end,'unit','-','reference_range','Not detected'),
              jsonb_build_object('parameter','Rifampicin resistance','value','Not detected','unit','-','reference_range','Not detected'))
          end,
          'performed_at', to_char(v_rdate, 'YYYY-MM-DD')
        );
        insert into public.medical_records
          (profile_id, hospital_id, created_by, record_type, record_date, data, created_at, updated_at)
        values
          (pat.id, v_hosp, v_doc, 'lab_test_result', v_rdate, v_data, v_cts, v_cts + interval '3 hours')
        returning id into v_recid;

      -- ================================================================
      elsif v_type = 'imaging_report' then
        -- ==============================================================
        v_tmp := (1 + floor(random() * 3))::int;
        v_data := jsonb_build_object(
          'modality', case v_tmp when 1 then 'X-ray' when 2 then 'Ultrasound' else 'CT scan' end,
          'body_part', case v_tmp when 1 then 'Chest (PA)' when 2 then 'Abdomen and pelvis' else 'Head (non-contrast)' end,
          'findings', case v_tmp
            when 1 then 'The cardiac silhouette is within normal limits. Patchy opacification noted in the right lower zone. No pleural effusion. Costophrenic angles are sharp.'
            when 2 then 'Liver is normal in size with smooth outline. Spleen mildly enlarged (~13 cm). No free fluid. Bowel gas pattern is non-specific.'
            else 'No intracranial haemorrhage. Ventricles are symmetric. No mass effect or midline shift.'
          end,
          'impression', case v_tmp
            when 1 then 'Right lower zone consolidation — consistent with pneumonia.'
            when 2 then 'Mild splenomegaly; correlate clinically for malaria or haematological cause.'
            else 'Unremarkable non-contrast CT of the head.'
          end,
          'radiologist', (ARRAY['Dr E. Chitsulo','Dr F. Kasondo','Dr L. Mwakyosa'])[(1 + floor(random() * 3))::int]
        );
        insert into public.medical_records
          (profile_id, hospital_id, created_by, record_type, record_date, data, created_at, updated_at)
        values
          (pat.id, v_hosp, v_doc, 'imaging_report', v_rdate, v_data, v_cts, v_cts + interval '1 day')
        returning id into v_recid;

      -- ================================================================
      elsif v_type = 'pathology_report' then
        -- ==============================================================
        v_dx := path_pool[(1 + floor(random() * array_length(path_pool, 1)))::int];
        select d.name into v_dxname from public.diagnosis_codes d where d.icd10_code = v_dx;
        v_duuid := gen_random_uuid();
        v_data := jsonb_build_object(
          'diagnosis_id', v_duuid,
          'icd10_code', v_dx,
          'specimen_type', 'Biopsy — punch',
          'site', case v_dx when 'C53.9' then 'Cervix uteri (6 o''clock position)' else 'Left breast, upper outer quadrant' end,
          'histological_findings', 'Sections show nests and sheets of malignant epithelial cells with marked nuclear pleomorphism and frequent mitoses invading the stroma.',
          'diagnosis', v_dxname || ' — invasive carcinoma',
          'grade', 'Grade ' || (1 + floor(random() * 3))::int
        );
        insert into public.medical_records
          (profile_id, hospital_id, created_by, record_type, record_date, data, created_at, updated_at)
        values
          (pat.id, v_hosp, v_doc, 'pathology_report', v_rdate, v_data, v_cts, v_cts + interval '5 days')
        returning id into v_recid;
        insert into public.diagnoses
          (id, record_id, profile_id, icd10_code, hospital_id, district, age_band, sex,
           notes, severity, diagnosed_at, created_at)
        values
          (v_duuid, v_recid, pat.id, v_dx, v_hosp, pat.district, v_band, pat.sex,
           v_data->>'histological_findings', v_data->>'grade', v_rdate, v_cts);

      -- ================================================================
      elsif v_type = 'medication_prescription' then
        -- ==============================================================
        v_dx := rx_pool[(1 + floor(random() * array_length(rx_pool, 1)))::int];
        v_meds_arr := case v_dx
          when 'B50.9' then ARRAY['AL_20_120']
          when 'A09'   then ARRAY['ORS','ZINC_20']
          when 'J06.9' then ARRAY['PARACETAMOL_500']
          when 'J18.9' then ARRAY['AMOXICILLIN_250','CEFTRIAXONE_1G']
          when 'N39.0' then ARRAY['COTRIMOXAZOLE_480','CIPROFLOXACIN_500']
          when 'J45'   then ARRAY['SALBUTAMOL_INH']
          when 'I10'   then ARRAY['AMLODIPINE_5']
          when 'E11.9' then ARRAY['METFORMIN_500']
          when 'K29.7' then ARRAY['ANTACID_SUSP']
          when 'D64.9' then ARRAY['FERROUS_FOLATE']
          when 'B65.9' then ARRAY['PRAZIQUANTEL_600']
          when 'B76.9' then ARRAY['MEBENDAZOLE_500']
          when 'L03.9' then ARRAY['CLOXACILLIN_500','CIPROFLOXACIN_500']
          when 'B24'   then ARRAY['TLD']
          when 'A16.9' then ARRAY['RHZE_TAB']
          when 'A00'   then ARRAY['ORS','DOXYCYCLINE_100']
          when 'F32.9' then ARRAY['SERTRALINE_50','AMITRIPTYLINE_25']
          when 'I50.9' then ARRAY['FUROSEMIDE_40','ENALAPRIL_10']
          else ARRAY['IBUPROFEN_400']  -- M17.9
        end;
        v_med := v_meds_arr[(1 + floor(random() * array_length(v_meds_arr, 1)))::int];
        select m.name into v_txt from public.medication_codes m where m.code = v_med;
        select d.name into v_dxname from public.diagnosis_codes d where d.icd10_code = v_dx;
        -- canonical dosing per medication
        if v_med = 'AL_20_120' then
          v_dose := '4 tablets'; v_route := 'ORAL'; v_freq := 'twice daily'; v_dur := '3 days'; v_qty := 24;
        elsif v_med = 'ORS' then
          v_dose := '1 sachet dissolved in 1 L clean water'; v_route := 'ORAL'; v_freq := 'after each loose stool'; v_dur := 'until diarrhoea stops'; v_qty := 10;
        elsif v_med = 'ZINC_20' then
          v_dose := '1 dispersible tablet'; v_route := 'ORAL'; v_freq := 'once daily'; v_dur := '10 days'; v_qty := 30;
        elsif v_med = 'PARACETAMOL_500' then
          v_dose := '2 tablets'; v_route := 'ORAL'; v_freq := 'every 6 hours as needed'; v_dur := '5 days'; v_qty := 60;
        elsif v_med = 'IBUPROFEN_400' then
          v_dose := '1 tablet'; v_route := 'ORAL'; v_freq := 'three times daily with food'; v_dur := '5 days'; v_qty := 15;
        elsif v_med = 'AMOXICILLIN_250' then
          v_dose := '2 capsules'; v_route := 'ORAL'; v_freq := 'three times daily'; v_dur := '5 days'; v_qty := 30;
        elsif v_med = 'CEFTRIAXONE_1G' then
          v_dose := '1 g deep IM daily'; v_route := 'IM'; v_freq := 'once daily'; v_dur := '5 days'; v_qty := 5;
        elsif v_med = 'COTRIMOXAZOLE_480' then
          v_dose := '2 tablets'; v_route := 'ORAL'; v_freq := 'twice daily'; v_dur := '5 days'; v_qty := 20;
        elsif v_med = 'CIPROFLOXACIN_500' then
          v_dose := '1 tablet'; v_route := 'ORAL'; v_freq := 'twice daily'; v_dur := '5 days'; v_qty := 10;
        elsif v_med = 'CLOXACILLIN_500' then
          v_dose := '1 capsule'; v_route := 'ORAL'; v_freq := 'four times daily'; v_dur := '7 days'; v_qty := 28;
        elsif v_med = 'SALBUTAMOL_INH' then
          v_dose := '2 puffs'; v_route := 'TOPICAL'; v_freq := 'four times daily and PRN'; v_dur := '1 month'; v_qty := 200;
        elsif v_med = 'AMLODIPINE_5' then
          v_dose := '1 tablet'; v_route := 'ORAL'; v_freq := 'once daily in the morning'; v_dur := '3 months'; v_qty := 90;
        elsif v_med = 'METFORMIN_500' then
          v_dose := '1 tablet'; v_route := 'ORAL'; v_freq := 'twice daily with meals'; v_dur := '3 months'; v_qty := 180;
        elsif v_med = 'ANTACID_SUSP' then
          v_dose := '10 mL'; v_route := 'ORAL'; v_freq := 'three times daily after meals'; v_dur := '2 weeks'; v_qty := 42;
        elsif v_med = 'FERROUS_FOLATE' then
          v_dose := '1 tablet'; v_route := 'ORAL'; v_freq := 'once daily'; v_dur := '3 months'; v_qty := 90;
        elsif v_med = 'PRAZIQUANTEL_600' then
          v_dose := '3 tablets as a single dose (40 mg/kg split)'; v_route := 'ORAL'; v_freq := 'single dose'; v_dur := '1 day'; v_qty := 3;
        elsif v_med = 'MEBENDAZOLE_500' then
          v_dose := '1 tablet'; v_route := 'ORAL'; v_freq := 'single dose, repeat after 6 months'; v_dur := '1 day'; v_qty := 1;
        elsif v_med = 'TLD' then
          v_dose := '1 tablet'; v_route := 'ORAL'; v_freq := 'once daily same time each day'; v_dur := '3 months'; v_qty := 90;
        elsif v_med = 'RHZE_TAB' then
          v_dose := '4 tablets by weight'; v_route := 'ORAL'; v_freq := 'once daily before breakfast'; v_dur := '2 months (intensive phase)'; v_qty := 240;
        elsif v_med = 'DOXYCYCLINE_100' then
          v_dose := '1 capsule'; v_route := 'ORAL'; v_freq := 'twice daily'; v_dur := '5 days'; v_qty := 10;
        elsif v_med = 'SERTRALINE_50' then
          v_dose := '1 tablet'; v_route := 'ORAL'; v_freq := 'once daily in the morning'; v_dur := '3 months'; v_qty := 84;
        elsif v_med = 'AMITRIPTYLINE_25' then
          v_dose := '1 tablet at night'; v_route := 'ORAL'; v_freq := 'once daily at bedtime'; v_dur := '2 months'; v_qty := 56;
        elsif v_med = 'FUROSEMIDE_40' then
          v_dose := '1 tablet'; v_route := 'ORAL'; v_freq := 'once daily in the morning'; v_dur := '1 month'; v_qty := 30;
        elsif v_med = 'ENALAPRIL_10' then
          v_dose := '1 tablet'; v_route := 'ORAL'; v_freq := 'once daily'; v_dur := '1 month'; v_qty := 30;
        else
          v_dose := 'As directed'; v_route := 'ORAL'; v_freq := 'once daily'; v_dur := '1 month'; v_qty := 30;
        end if;
        v_puuid := gen_random_uuid();
        v_data := jsonb_build_object(
          'prescription_id', v_puuid,
          'medication_code', v_med,
          'medication', v_txt,
          'dose', v_dose,
          'route', v_route,
          'frequency', v_freq,
          'duration', v_dur,
          'indication', coalesce(v_dxname, 'Clinical indication documented in notes'),
          'quantity', v_qty::text
        );
        insert into public.medical_records
          (profile_id, hospital_id, created_by, record_type, record_date, data, created_at, updated_at)
        values
          (pat.id, v_hosp, v_doc, 'medication_prescription', v_rdate, v_data, v_cts, v_cts)
        returning id into v_recid;
        insert into public.prescriptions
          (id, record_id, profile_id, diagnosis_id, medication_code, dose, route, frequency,
           duration, indication, quantity, hospital_id, district, age_band, prescribed_at, created_at)
        values
          (v_puuid, v_recid, pat.id, null, v_med, v_dose, v_route, v_freq,
           v_dur, v_dxname, v_qty, v_hosp, pat.district, v_band, v_rdate, v_cts);

      -- ================================================================
      elsif v_type = 'medication_administration' then
        -- ==============================================================
        v_med := (ARRAY['QUININE_INF','CEFTRIAXONE_1G','HYDROCORT_100','MORPHINE_10'])[(1 + floor(random() * 4))::int];
        select m.name into v_txt from public.medication_codes m where m.code = v_med;
        v_data := jsonb_build_object(
          'medication', v_txt,
          'dose', case v_med
            when 'QUININE_INF' then '600 mg in 500 mL NS over 4 hours'
            when 'CEFTRIAXONE_1G' then '1 g IV over 5 minutes'
            when 'HYDROCORT_100' then '100 mg IV stat'
            else '5 mg IV titrated' end,
          'route', case v_med when 'QUININE_INF' then 'IV' when 'MORPHINE_10' then 'SC' else 'IV' end,
          'administered_at', to_char(v_cts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'administered_by', v_docname
        );
        insert into public.medical_records
          (profile_id, hospital_id, created_by, record_type, record_date, data, created_at, updated_at)
        values
          (pat.id, v_hosp, v_doc, 'medication_administration', v_rdate, v_data, v_cts, v_cts)
        returning id into v_recid;

      -- ================================================================
      elsif v_type = 'surgical_procedure' then
        -- ==============================================================
        v_tmp := (1 + floor(random() * 5))::int;
        v_data := jsonb_build_object(
          'procedure_name', case v_tmp
            when 1 then 'Open appendicectomy'
            when 2 then 'Inguinal hernia repair (Lichtenstein mesh)'
            when 3 then 'Exploratory laparotomy'
            when 4 then 'Wound debridement and primary closure'
            else 'Incision and drainage of abscess' end,
          'procedure_date', to_char(v_rdate, 'YYYY-MM-DD'),
          'surgeon', v_docname,
          'anesthesia', (ARRAY['General anaesthesia','Spinal anaesthesia','Ketamine dissociative sedation'])[(1 + floor(random() * 3))::int],
          'complications', case when random() < 0.2 then 'Mild intraoperative bleeding, controlled.' else null end
        );
        insert into public.medical_records
          (profile_id, hospital_id, created_by, record_type, record_date, data, created_at, updated_at)
        values
          (pat.id, v_hosp, v_doc, 'surgical_procedure', v_rdate, v_data, v_cts, v_cts + interval '4 hours')
        returning id into v_recid;

      -- ================================================================
      elsif v_type = 'nursing_notes' then
        -- ==============================================================
        v_data := jsonb_build_object(
          'shift', (ARRAY['Morning','Afternoon','Night'])[(1 + floor(random() * 3))::int],
          'observations', 'Patient alert and oriented. Tolerating oral fluids. Complains of mild pain at wound/injection site. No new concerns overnight.',
          'vital_signs', jsonb_build_object(
            'bp', (105 + floor(random() * 40))::int || '/' || (65 + floor(random() * 25))::int,
            'pulse', (58 + floor(random() * 45))::int || ' bpm'),
          'notes', case floor(random() * 3)::int
            when 0 then 'Medication administered on time. Encouraged ambulation and deep breathing exercises.'
            when 1 then 'Family visited; patient in good spirits. Dressing dry and intact.'
            else 'Sleeping well. Awaiting morning doctor review for possible discharge.'
          end
        );
        insert into public.medical_records
          (profile_id, hospital_id, created_by, record_type, record_date, data, created_at, updated_at)
        values
          (pat.id, v_hosp, v_doc, 'nursing_notes', v_rdate, v_data, v_cts, v_cts)
        returning id into v_recid;

      -- ================================================================
      elsif v_type = 'intake_output_chart' then
        -- ==============================================================
        v_num := (800 + floor(random() * 900));
        v_data := jsonb_build_object(
          'intake', jsonb_build_object(
            'oral', v_num::int || ' mL (water, ORS)',
            'iv', (500 + floor(random() * 1500))::int || ' mL NS'),
          'output', jsonb_build_object(
            'urine', (v_num + floor(random() * 700) - 300)::int || ' mL'),
          'net_balance', case when random() < 0.5 then 'Approximately positive balance — improving hydration status.' else 'Approximately negative balance — monitor for dehydration.' end
        );
        insert into public.medical_records
          (profile_id, hospital_id, created_by, record_type, record_date, data, created_at, updated_at)
        values
          (pat.id, v_hosp, v_doc, 'intake_output_chart', v_rdate, v_data, v_cts, v_cts)
        returning id into v_recid;

      -- ================================================================
      elsif v_type = 'screening_test' then
        -- ==============================================================
        v_tmp := (1 + floor(random() * 5))::int;
        v_data := jsonb_build_object(
          'screening_type', case v_tmp
            when 1 then 'Blood pressure screening'
            when 2 then 'HIV rapid test (provider-initiated)'
            when 3 then 'Cervical cancer screening (VIA)'
            when 4 then 'Random blood glucose screen'
            else 'TB symptom screen' end,
          'result', case v_tmp
            when 1 then (140 + floor(random() * 20))::int || '/' || (88 + floor(random() * 12))::int || ' mmHg — elevated'
            when 2 then case when random() < 0.05 then 'Reactive — confirmatory test done' else 'Non-reactive' end
            when 3 then case when pat.sex = 'female' then 'Negative — no acetowhite epithelium seen' else 'Not applicable — male client screened for other services' end
            when 4 then round((4.5 + random() * 5)::numeric, 1) || ' mmol/L'
            else 'No red-flag symptoms identified' end,
          'recommended_follow_up', case v_tmp
            when 1 then 'Repeat BP in 2 weeks; lifestyle and salt-reduction advice.'
            when 2 then 'Routine retesting per national guidelines.'
            when 3 then 'Repeat VIA screening in 3 years.'
            when 4 then 'Fasting blood glucose in 1 week if elevated.'
            else 'No follow-up required.' end
        );
        insert into public.medical_records
          (profile_id, hospital_id, created_by, record_type, record_date, data, created_at, updated_at)
        values
          (pat.id, v_hosp, v_doc, 'screening_test', v_rdate, v_data, v_cts, v_cts)
        returning id into v_recid;

      -- ================================================================
      elsif v_type = 'psychiatric_evaluation' then
        -- ==============================================================
        v_dx := psy_pool[(1 + floor(random() * array_length(psy_pool, 1)))::int];
        select d.name into v_dxname from public.diagnosis_codes d where d.icd10_code = v_dx;
        v_duuid := gen_random_uuid();
        v_data := jsonb_build_object(
          'diagnosis_id', v_duuid,
          'icd10_code', v_dx,
          'presenting_problem', case v_dx
            when 'F32.9' then 'Low mood, poor sleep and loss of interest for the past 3 months following job loss.'
            when 'F41.1' then 'Constant worry, palpitations and difficulty concentrating for 6 months.'
            else 'Auditory hallucinations and self-neglect reported by family over 8 months.' end,
          'mental_status_exam', jsonb_build_object(
            'mood', (ARRAY['Low','Anxious','Flat','Euthymic'])[(1 + floor(random() * 4))::int],
            'affect', (ARRAY['Restricted','Appropriate to mood','Blunted'])[(1 + floor(random() * 3))::int],
            'thought_process', (ARRAY['Logical and goal-directed','Slowed','Formal thought disorder absent'])[(1 + floor(random() * 3))::int]),
          'diagnosis', v_dxname,
          'risk_assessment', case when random() < 0.3 then 'Moderate — passive thoughts of death without plan; safety plan agreed.' else 'Low — no suicidal ideation or intent.' end
        );
        insert into public.medical_records
          (profile_id, hospital_id, created_by, record_type, record_date, data, created_at, updated_at)
        values
          (pat.id, v_hosp, v_doc, 'psychiatric_evaluation', v_rdate, v_data, v_cts, v_cts + interval '1 hour')
        returning id into v_recid;
        insert into public.diagnoses
          (id, record_id, profile_id, icd10_code, hospital_id, district, age_band, sex,
           notes, severity, diagnosed_at, created_at)
        values
          (v_duuid, v_recid, pat.id, v_dx, v_hosp, pat.district, v_band, pat.sex,
           v_dxname, null, v_rdate, v_cts);

      -- ================================================================
      elsif v_type = 'discharge_summary' then
        -- ==============================================================
        v_dx := adm_pool[(1 + floor(random() * array_length(adm_pool, 1)))::int];
        select d.name into v_dxname from public.diagnosis_codes d where d.icd10_code = v_dx;
        v_duuid := gen_random_uuid();
        v_data := jsonb_build_object(
          'diagnosis_id', v_duuid,
          'icd10_code', v_dx,
          'admission_date', to_char(v_rdate - (3 + floor(random() * 8))::int, 'YYYY-MM-DD'),
          'discharge_date', to_char(v_rdate, 'YYYY-MM-DD'),
          'final_diagnosis', v_dxname,
          'treatments_given', to_jsonb(ARRAY[
            (ARRAY['IV fluids','IV antibiotics','Antimalarial therapy (IV then oral)','Analgesia','Blood transfusion','Oxygen therapy'])[(1 + floor(random() * 6))::int],
            (ARRAY['Daily vital signs monitoring','Physiotherapy sessions','Nutritional support','Wound care'])[(1 + floor(random() * 4))::int]
          ]),
          'discharge_medications', to_jsonb(ARRAY[
            'Amoxicillin 250 mg — 1 cap TDS × 5 days',
            'Paracetamol 500 mg — 2 tabs QDS PRN × 5 days'
          ]),
          'follow_up_instructions', 'Review at outpatient department in 7 days with all medications. Return immediately if fever recurs, vomiting persists, or breathing becomes difficult.'
        );
        insert into public.medical_records
          (profile_id, hospital_id, created_by, record_type, record_date, data, created_at, updated_at)
        values
          (pat.id, v_hosp, v_doc, 'discharge_summary', v_rdate, v_data, v_cts, v_cts)
        returning id into v_recid;
        insert into public.diagnoses
          (id, record_id, profile_id, icd10_code, hospital_id, district, age_band, sex,
           notes, severity, diagnosed_at, created_at)
        values
          (v_duuid, v_recid, pat.id, v_dx, v_hosp, pat.district, v_band, pat.sex,
           v_dxname, null, v_rdate, v_cts);

      -- ================================================================
      else  -- referral_record
        -- ==============================================================
        v_data := jsonb_build_object(
          'referred_to', (ARRAY[
            'Kamuzu Central Hospital','Queen Elizabeth Central Hospital',
            'Mwaiwathu Private Hospital','Partners In Hope — ART clinic',
            'Zomba Mental Hospital'])[(1 + floor(random() * 5))::int],
          'reason', (ARRAY[
            'Specialist review required for persistent symptoms despite adequate treatment.',
            'Requires advanced imaging unavailable at this facility.',
            'Initiation of specialised long-term treatment plan.',
            'Second opinion requested by the attending clinician.'])[(1 + floor(random() * 4))::int],
          'urgency', case when random() < 0.2 then 'HIGH' when random() < 0.65 then 'MEDIUM' else 'LOW' end
        );
        insert into public.medical_records
          (profile_id, hospital_id, created_by, record_type, record_date, data, created_at, updated_at)
        values
          (pat.id, v_hosp, v_doc, 'referral_record', v_rdate, v_data, v_cts, v_cts)
        returning id into v_recid;
      end if;
    end loop;
  end loop;

  select count(*) into n from public.medical_records;
  raise notice 'Seeded % medical records in total.', n;
end $$;

-- ============================================================================
-- RECORD ATTACHMENTS (~12% of records carry a file)
-- ============================================================================
insert into public.record_attachments (record_id, url, storage_path, file_type, file_size_bytes, checksum, uploaded_by, created_at)
select
  r.id,
  'https://storage.chipatala.mw/vault/' || r.profile_id || '/' || r.id || '/' ||
    case (floor(random() * 3))::int when 0 then 'scan.pdf' when 1 then 'photo.jpg' else 'report.png' end,
  'vault/' || r.profile_id || '/' || r.id || '/attachment-' || floor(random() * 9000 + 1000)::text,
  case (floor(random() * 3))::int when 0 then 'application/pdf' when 1 then 'image/jpeg' else 'image/png' end,
  (80 + floor(random() * 8000))::bigint * 1024,
  md5(r.id::text || random()::text),
  r.created_by,
  r.updated_at + interval '10 minutes'
from public.medical_records r
where random() < 0.12;

-- ============================================================================
-- ACCESS GRANTS + AUDIT TRAIL (actions)
-- ============================================================================
do $$
declare
  ua_pool text[] := ARRAY[
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0',
    'Mozilla/5.0 (Linux; Android 13; Redmi 12) Chrome/123.0 Mobile',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Safari/604.1',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/17.4'];
  loc_pool text[] := ARRAY[
    'Kamuzu Central Hospital — Adult OPD','Kamuzu Central Hospital — Casualty',
    'Queen Elizabeth Central Hospital — OPD','Queen Elizabeth Central Hospital — Casualty',
    'Bwaila Hospital — Outpatients','Ndirande Health Centre — OPD',
    'Likuni Mission Hospital — OPD','Remote — Lilongwe Urban','Remote — Blantyre Urban'];
  emergency_reasons text[] := ARRAY[
    'Road traffic accident victim unconscious, no relatives present — need allergies/blood type.',
    'Suspected severe malaria in pregnancy — verifying chronic conditions and medications.',
    'Stroke code in casualty — urgent need of blood type and anticoagulant history.',
    'Unconscious patient brought by bystander — checking emergency contact and conditions.',
    'Severe asthma attack — confirming current inhalers before escalation.',
    'Post-operative confusion — reviewing chronic conditions before prescribing.'];

  gp_id text; gp_name text; gp_district district;
  gd_id text; gd_name text; gd_license text; gd_district text; gd_hosp text;
  v_doctor_pick text;
  v_reason text; v_rev boolean;
  v_snap_name text; v_snap_license text; v_snap_hosp text;
  v_gid uuid;
  v_code text;
  v_dur int;
  v_state int;
  v_created timestamptz;
  v_used timestamptz;
  v_expires timestamptz;
  v_ip text;
  v_dev text;
  v_loc text;
  j int;
  v_pid text;
  v_actor text;
begin
  -- ---------------- access_grants -------------------------------------------
  for g in 1..24 loop
    select u.id, u.name, u.district into gp_id, gp_name, gp_district
      from public.users u where u.role = 'patient'
      order by u.id limit 1 offset floor(random() * 46)::int;

    if random() < 0.85 then
      v_doctor_pick := case when gp_district = 'lilongwe' then 'seed_user_003' else 'seed_user_004' end;
    else
      v_doctor_pick := case when gp_district = 'lilongwe' then 'seed_user_004' else 'seed_user_003' end;
    end if;
    select u.id, u.name, u.medical_license_no, u.district::text,
           (select h.name from public.hospitals h where h.id = u.hospital_id)
      into gd_id, gd_name, gd_license, gd_district, gd_hosp
      from public.users u where u.id = v_doctor_pick;

    v_dur := (ARRAY[1800, 3600, 7200, 14400])[(1 + floor(random() * 4))::int];
    v_code := 'CR-' || upper(substr(md5(g::text || clock_timestamp()::text), 1, 6));
    v_ip := '102.177.' || (1 + floor(random() * 254))::int || '.' || (1 + floor(random() * 254))::int;
    v_dev := ua_pool[(1 + floor(random() * 4))::int];
    v_loc := loc_pool[(1 + floor(random() * 9))::int];
    v_state := g % 4;  -- 0 fresh · 1 redeemed-active · 2 redeemed-expired · 3 revoked

    if v_state = 1 then
      v_created := now() - interval '35 minutes';
    elsif v_state = 2 then
      v_created := now() - make_interval(days => 25 + floor(random() * 40)::int);
    elsif v_state = 3 then
      v_created := now() - make_interval(days => 10 + floor(random() * 20)::int);
    else
      v_created := now() - make_interval(days => floor(random() * 5)::int, hours => floor(random() * 20)::int);
    end if;

    insert into public.access_grants
      (profile_id, doctor_id, issued_by, code, duration_seconds,
       is_used, used_at, expires_at, is_revoked, created_at)
    values
      (gp_id, gd_id, gp_id, v_code, v_dur,
       false, null, null, false, v_created)
    returning id into v_gid;

    -- patient issued the code
    insert into public.actions
      (profile_id, actor_id, action_type, access_grant_id, location, ip_address, device_info, created_at)
    values
      (gp_id, gp_id, 'code_issued', v_gid, v_loc, v_ip::inet, v_dev, v_created);

    if v_state in (1, 2) then
      v_used := v_created + interval '5 minutes';
      v_expires := v_used + make_interval(secs => v_dur);
      update public.access_grants
        set is_used = true, used_at = v_used, expires_at = v_expires
        where id = v_gid;

      insert into public.actions
        (profile_id, actor_id, action_type, access_grant_id, reason,
         doctor_name, medical_license_no, hospital_name, district,
         location, ip_address, device_info, created_at)
      values
        (gp_id, gd_id, 'code_redeemed', v_gid, 'Access code redeemed at point of care.',
         gd_name, gd_license, gd_hosp, gd_district,
         loc_pool[(1 + floor(random() * 7))::int], v_ip::inet, ua_pool[(1 + floor(random() * 4))::int], v_used);

      -- one or two reads while the grant was live
      for j in 1..(1 + floor(random() * 2)::int) loop
        insert into public.actions
          (profile_id, actor_id, action_type, access_grant_id,
           doctor_name, medical_license_no, hospital_name, district,
           location, ip_address, device_info, created_at)
        values
          (gp_id, gd_id, 'foreign_access', v_gid,
           gd_name, gd_license, gd_hosp, gd_district,
           loc_pool[(1 + floor(random() * 7))::int], v_ip::inet, ua_pool[(1 + floor(random() * 4))::int],
           v_used + make_interval(mins => j * 4));
      end loop;
    elsif v_state = 3 then
      update public.access_grants set is_revoked = true where id = v_gid;
      insert into public.actions
        (profile_id, actor_id, action_type, access_grant_id, reason, location, ip_address, device_info, created_at)
      values
        (gp_id, gp_id, 'code_revoked', v_gid, 'Patient revoked the code before use.',
         v_loc, v_ip::inet, v_dev, v_created + interval '30 minutes');
    end if;
  end loop;

  -- ---------------- emergency break-glass accesses --------------------------
  for g in 1..6 loop
    select u.id into v_pid from public.users u where u.role = 'patient'
      order by u.id limit 1 offset floor(random() * 46)::int;
    v_actor := (ARRAY['seed_user_003','seed_user_004','seed_user_001','seed_user_002'])[((g - 1) % 4) + 1];
    select u.name, u.medical_license_no, u.district::text,
           (select h.name from public.hospitals h where h.id = u.hospital_id)
      into v_snap_name, v_snap_license, gd_district, v_snap_hosp
      from public.users u where u.id = v_actor;
    v_created := now() - make_interval(days => 5 + floor(random() * 80)::int, hours => floor(random() * 20)::int);
    v_ip := '102.177.' || (1 + floor(random() * 254))::int || '.' || (1 + floor(random() * 254))::int;
    v_reason := emergency_reasons[(1 + floor(random() * 6))::int];
    v_rev := random() < 0.6;

    insert into public.actions
      (profile_id, actor_id, action_type, reason,
       doctor_name, medical_license_no, hospital_name, district,
       reviewed, reviewed_by, reviewed_at,
       location, ip_address, device_info, created_at)
    values
      (v_pid, v_actor, 'emergency_access', v_reason,
       v_snap_name, v_snap_license, v_snap_hosp, gd_district,
       v_rev,
       case when v_rev then 'seed_user_001' end,
       case when v_rev then v_created + interval '2 days' end,
       loc_pool[(1 + floor(random() * 9))::int], v_ip::inet,
       ua_pool[(1 + floor(random() * 4))::int], v_created);
  end loop;

  -- ---------------- routine admin accesses -----------------------------------
  for g in 1..4 loop
    v_actor := case when g <= 2 then 'seed_user_002' else 'seed_user_001' end;
    if v_actor = 'seed_user_002' then
      select u.id into v_pid from public.users u
        where u.role = 'patient' and u.district = 'blantyre'
        order by u.id limit 1 offset floor(random() * 22)::int;
    else
      select u.id into v_pid from public.users u where u.role = 'patient'
        order by u.id limit 1 offset floor(random() * 46)::int;
    end if;
    v_created := now() - make_interval(days => 3 + floor(random() * 40)::int);
    insert into public.actions
      (profile_id, actor_id, action_type, reason, reviewed, reviewed_by, reviewed_at,
       location, ip_address, device_info, created_at)
    values
      (v_pid, v_actor, 'admin_access',
       case when v_actor = 'seed_user_002'
         then 'District records audit — verifying completeness of facility submissions.'
         else 'Country-level compliance spot check on record integrity.' end,
       true, 'seed_user_001', v_created + interval '1 day',
       case when v_actor = 'seed_user_002' then 'District Health Office — Blantyre' else 'Ministry of Health Headquarters — Lilongwe' end,
       ('102.177.' || (1 + floor(random() * 254))::int || '.' || (1 + floor(random() * 254))::int)::inet,
       ua_pool[(1 + floor(random() * 4))::int], v_created);
  end loop;

  -- ---------------- analytics report runs ------------------------------------
  insert into public.actions
    (profile_id, actor_id, action_type, reason, location, ip_address, device_info, created_at)
  values
    ('seed_user_002', 'seed_user_002', 'analytics_report_access',
     'Quarterly malaria burden report — Blantyre district aggregate.', 'District Health Office — Blantyre',
     ('102.177.' || (1 + floor(random() * 254))::int || '.' || (1 + floor(random() * 254))::int)::inet,
     ua_pool[1], now() - interval '12 days'),
    ('seed_user_001', 'seed_user_001', 'analytics_report_access',
     'Annual HIV treatment cascade report — national aggregate.', 'Ministry of Health Headquarters — Lilongwe',
     ('102.177.' || (1 + floor(random() * 254))::int || '.' || (1 + floor(random() * 254))::int)::inet,
     ua_pool[1], now() - interval '40 days'),
    ('seed_user_001', 'seed_user_001', 'analytics_report_access',
     'Monthly immunisation coverage report — Lilongwe & Blantyre aggregates.', 'Ministry of Health Headquarters — Lilongwe',
     ('102.177.' || (1 + floor(random() * 254))::int || '.' || (1 + floor(random() * 254))::int)::inet,
     ua_pool[1], now() - interval '6 days');
end $$;

-- Re-enable the derived-facts trigger (no-op if it was never installed) -------
do $$
begin
  execute 'alter table public.medical_records enable trigger medical_records_populate_facts';
exception when others then
  null;
end $$;

commit;

-- ============================================================================
-- SANITY CHECKS (run manually if desired)
-- ----------------------------------------------------------------------------
-- select role, count(*) from public.users group by role order by role;
-- select district, count(*) filter (where role='patient') from public.users group by district;
-- select record_type, count(*) from public.medical_records group by 1 order by 2 desc;
-- select profile_id, count(*) from public.medical_records group by 1 order by 1;  -- 10..30 per patient
-- select count(*) from public.diagnoses;
-- select count(*) from public.prescriptions;
-- select count(*) from public.immunizations;
-- select count(*) from public.access_grants;
-- select action_type, count(*) from public.actions group by 1 order by 2 desc;
-- ============================================================================
