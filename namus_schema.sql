-- =====================================================================
-- SCHEMA NOTE
-- =====================================================================
-- NamUs's actual internal database schema (table names, column names,
-- relationships) is NOT publicly available. It is documented in an
-- Interface Control Document (ICD) shared only with vetted agencies
-- doing server-to-server case imports.
--
-- This schema is built from NamUs's PUBLICLY DOCUMENTED case data
-- structure: the field categories and data points that appear on
-- public case profiles for Missing Persons (MP), Unidentified
-- Persons (UP), and Unclaimed Persons (UCP) cases, plus the
-- cross-cutting categories (biometrics, circumstances, agencies,
-- documents) common to all three case types.
--
-- Use this as a solid, realistic starting point for a NamUs-like
-- system -- not as a literal copy of NamUs's production database.
-- =====================================================================

-- ---------------------------------------------------------------------
-- CORE / SHARED TABLES
-- ---------------------------------------------------------------------

CREATE TABLE case_types (
    case_type_id        SMALLINT PRIMARY KEY,
    code                VARCHAR(4)  NOT NULL UNIQUE,   -- 'MP', 'UP', 'UCP'
    label               VARCHAR(50) NOT NULL
);

CREATE TABLE cases (
    case_id             BIGINT PRIMARY KEY,
    case_number         VARCHAR(20) NOT NULL UNIQUE,   -- e.g. 'MP12345'
    case_type_id        SMALLINT NOT NULL REFERENCES case_types(case_type_id),
    status              VARCHAR(20) NOT NULL DEFAULT 'Open',  -- Open, Resolved, Cancelled
    date_created        TIMESTAMP NOT NULL DEFAULT now(),
    date_modified       TIMESTAMP NOT NULL DEFAULT now(),
    date_resolved       DATE,
    date_of_last_contact DATE,                          -- MP: last known alive/seen
    date_body_found     DATE,                            -- UP/UCP
    is_public           BOOLEAN NOT NULL DEFAULT TRUE,
    legacy_namus1_id     VARCHAR(20)                      -- migration artifact
);

CREATE TABLE agencies (
    agency_id           BIGINT PRIMARY KEY,
    agency_name         VARCHAR(200) NOT NULL,
    agency_type         VARCHAR(50),                     -- Law Enforcement, ME/C, RPS, etc.
    ori_number          VARCHAR(20),                     -- Originating Agency Identifier
    address_line1       VARCHAR(200),
    address_line2       VARCHAR(200),
    city                VARCHAR(100),
    state_code          VARCHAR(2),
    zip_code            VARCHAR(10),
    county              VARCHAR(100),
    country             VARCHAR(50) DEFAULT 'USA',
    phone               VARCHAR(20),
    fax                 VARCHAR(20)
);

CREATE TABLE case_agencies (
    case_id             BIGINT NOT NULL REFERENCES cases(case_id),
    agency_id           BIGINT NOT NULL REFERENCES agencies(agency_id),
    agency_role         VARCHAR(50) NOT NULL,            -- Investigating, ME/C, RPS
    contact_name        VARCHAR(150),
    contact_title       VARCHAR(100),
    contact_phone       VARCHAR(20),
    contact_email       VARCHAR(150),
    PRIMARY KEY (case_id, agency_id, agency_role)
);

-- ---------------------------------------------------------------------
-- DEMOGRAPHICS / BIOLOGICAL PROFILE (applies to MP, UP, UCP subjects)
-- ---------------------------------------------------------------------

CREATE TABLE persons (
    person_id           BIGINT PRIMARY KEY,
    case_id             BIGINT NOT NULL REFERENCES cases(case_id),
    first_name          VARCHAR(100),
    middle_name         VARCHAR(100),
    last_name           VARCHAR(100),
    nickname_aliases    VARCHAR(300),
    sex                 VARCHAR(10),                     -- Male, Female, Unsure
    race_ethnicity      VARCHAR(100),                    -- multi-select in real NamUs; simplified here
    date_of_birth       DATE,
    age_from            SMALLINT,                        -- estimated age range low
    age_to              SMALLINT,                        -- estimated age range high
    age_at_incident     SMALLINT,
    height_from_in       SMALLINT,                        -- inches
    height_to_in         SMALLINT,
    weight_from_lb       SMALLINT,
    weight_to_lb         SMALLINT,
    hair_color          VARCHAR(50),
    hair_length         VARCHAR(50),
    hair_texture        VARCHAR(50),
    left_eye_color      VARCHAR(50),
    right_eye_color     VARCHAR(50),
    is_multiracial      BOOLEAN DEFAULT FALSE,
    is_tribal_affiliated BOOLEAN DEFAULT FALSE,
    tribal_affiliation  VARCHAR(150)
);

CREATE TABLE physical_features (
    feature_id          BIGINT PRIMARY KEY,
    person_id           BIGINT NOT NULL REFERENCES persons(person_id),
    feature_type        VARCHAR(30) NOT NULL,            -- Tattoo, Scar, Mark, Piercing, Amputation
    body_location       VARCHAR(150),
    description         TEXT,
    approximate_size    VARCHAR(50)
);

CREATE TABLE medical_conditions (
    condition_id        BIGINT PRIMARY KEY,
    person_id           BIGINT NOT NULL REFERENCES persons(person_id),
    condition_name      VARCHAR(200),
    condition_category  VARCHAR(100),                    -- e.g. cardiovascular, prosthetic
    notes               TEXT
);

CREATE TABLE dental_records (
    dental_id           BIGINT PRIMARY KEY,
    person_id           BIGINT NOT NULL REFERENCES persons(person_id),
    has_dental_chart    BOOLEAN DEFAULT FALSE,
    tooth_number        SMALLINT,
    condition_code      VARCHAR(20),                     -- filled, missing, crown, etc.
    notes               TEXT
);

-- ---------------------------------------------------------------------
-- CASE-TYPE-SPECIFIC DETAIL TABLES
-- ---------------------------------------------------------------------

CREATE TABLE missing_person_details (
    case_id             BIGINT PRIMARY KEY REFERENCES cases(case_id),
    person_id           BIGINT NOT NULL REFERENCES persons(person_id),
    last_seen_date      DATE,
    last_seen_location_city    VARCHAR(100),
    last_seen_location_state   VARCHAR(2),
    last_seen_location_county  VARCHAR(100),
    circumstances       TEXT,
    possible_destination TEXT,
    vehicle_involved    BOOLEAN DEFAULT FALSE,
    vehicle_description TEXT,
    conditions_of_disappearance VARCHAR(100),             -- Endangered, Involuntary, Runaway, etc.
    clothing_description TEXT,
    jewelry_description TEXT,
    eyewear_description TEXT
);

CREATE TABLE unidentified_person_details (
    case_id             BIGINT PRIMARY KEY REFERENCES cases(case_id),
    person_id           BIGINT NOT NULL REFERENCES persons(person_id),
    date_found          DATE,
    location_found_city VARCHAR(100),
    location_found_state VARCHAR(2),
    location_found_county VARCHAR(100),
    location_description TEXT,
    circumstances_of_recovery TEXT,
    estimated_year_of_death_from SMALLINT,
    estimated_year_of_death_to   SMALLINT,
    condition_of_remains VARCHAR(100),                    -- Skeletal, Decomposed, Fresh, etc.
    manner_of_death     VARCHAR(50),
    clothing_description TEXT,
    jewelry_description TEXT,
    other_items_description TEXT
);

CREATE TABLE unclaimed_person_details (
    case_id             BIGINT PRIMARY KEY REFERENCES cases(case_id),
    person_id           BIGINT NOT NULL REFERENCES persons(person_id),
    date_of_death       DATE,
    place_of_death_city VARCHAR(100),
    place_of_death_state VARCHAR(2),
    identification_method VARCHAR(150),                   -- how identity WAS established
    reason_unclaimed    TEXT,
    custodial_agency_id BIGINT REFERENCES agencies(agency_id)
);

-- ---------------------------------------------------------------------
-- BIOMETRICS
-- ---------------------------------------------------------------------

CREATE TABLE fingerprint_records (
    fingerprint_id      BIGINT PRIMARY KEY,
    person_id           BIGINT NOT NULL REFERENCES persons(person_id),
    afis_entered        BOOLEAN DEFAULT FALSE,
    afis_number         VARCHAR(50),
    quality             VARCHAR(30),
    date_processed      DATE
);

CREATE TABLE dna_samples (
    dna_sample_id       BIGINT PRIMARY KEY,
    person_id           BIGINT NOT NULL REFERENCES persons(person_id),
    sample_type         VARCHAR(50),                      -- Reference, Family Reference, Direct Reference
    codis_uploaded      BOOLEAN DEFAULT FALSE,
    codis_upload_date   DATE,
    lab_name            VARCHAR(200),
    relationship_to_missing VARCHAR(100),                 -- for family reference samples
    notes               TEXT
);

-- ---------------------------------------------------------------------
-- DOCUMENTS / MEDIA
-- ---------------------------------------------------------------------

CREATE TABLE case_documents (
    document_id         BIGINT PRIMARY KEY,
    case_id             BIGINT NOT NULL REFERENCES cases(case_id),
    document_type       VARCHAR(50),                      -- Dental Chart, Autopsy Report, Poster
    file_name           VARCHAR(255),
    uploaded_by_agency_id BIGINT REFERENCES agencies(agency_id),
    date_uploaded       TIMESTAMP DEFAULT now(),
    is_public           BOOLEAN DEFAULT FALSE
);

CREATE TABLE case_images (
    image_id            BIGINT PRIMARY KEY,
    case_id             BIGINT NOT NULL REFERENCES cases(case_id),
    image_type          VARCHAR(50),                      -- Photo, Composite, Clothing, Sketch
    file_name           VARCHAR(255),
    caption             TEXT,
    is_primary          BOOLEAN DEFAULT FALSE,
    date_uploaded       TIMESTAMP DEFAULT now()
);

-- ---------------------------------------------------------------------
-- CROSS-MATCHING / CASE RELATIONSHIPS
-- ---------------------------------------------------------------------

CREATE TABLE case_matches (
    match_id            BIGINT PRIMARY KEY,
    case_id_a           BIGINT NOT NULL REFERENCES cases(case_id),
    case_id_b           BIGINT NOT NULL REFERENCES cases(case_id),
    match_type          VARCHAR(50),                      -- Possible Match, Confirmed Match
    match_score         DECIMAL(5,2),
    date_flagged        TIMESTAMP DEFAULT now(),
    reviewed_by_agency_id BIGINT REFERENCES agencies(agency_id)
);

-- ---------------------------------------------------------------------
-- INDEXES (typical access patterns: search by demographics/location)
-- ---------------------------------------------------------------------

CREATE INDEX idx_persons_case_id ON persons(case_id);
CREATE INDEX idx_persons_names ON persons(last_name, first_name);
CREATE INDEX idx_mp_last_seen ON missing_person_details(last_seen_location_state, last_seen_location_city);
CREATE INDEX idx_up_found ON unidentified_person_details(location_found_state, location_found_city);
CREATE INDEX idx_cases_status ON cases(status);
CREATE INDEX idx_cases_type ON cases(case_type_id);
