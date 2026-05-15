-- Table: public.services

-- DROP TABLE IF EXISTS public.services;

CREATE TABLE IF NOT EXISTS public.services
(
    id integer NOT NULL DEFAULT nextval('services_id_seq'::regclass),
    freelancer_id integer NOT NULL,
    service_name character varying(150) COLLATE pg_catalog."default" NOT NULL,
    service_description text COLLATE pg_catalog."default",
    service_price numeric(10,2),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    delivery_time character varying COLLATE pg_catalog."default",
    plan_type character varying COLLATE pg_catalog."default",
    thumbnail_file text COLLATE pg_catalog."default",
    min_delivery_days integer,
    max_delivery_days integer,
    service_title character varying(255) COLLATE pg_catalog."default",
    about_service text COLLATE pg_catalog."default",
    CONSTRAINT services_pkey PRIMARY KEY (id),
    CONSTRAINT services_freelancer_id_fkey FOREIGN KEY (freelancer_id)
        REFERENCES public.freelancer (freelancer_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.services
    OWNER to postgres;
-- Index: idx_services_name_price

-- DROP INDEX IF EXISTS public.idx_services_name_price;

CREATE INDEX IF NOT EXISTS idx_services_name_price
    ON public.services USING btree
    (service_name COLLATE pg_catalog."default" ASC NULLS LAST, freelancer_id ASC NULLS LAST)
    TABLESPACE pg_default;


    -- Table: public.admin

-- DROP TABLE IF EXISTS public.admin;

CREATE TABLE IF NOT EXISTS public.admin
(
    id integer NOT NULL DEFAULT nextval('admin_id_seq'::regclass),
    user_id integer NOT NULL,
    full_name character varying(255) COLLATE pg_catalog."default",
    first_name character varying(100) COLLATE pg_catalog."default" NOT NULL,
    last_name character varying(100) COLLATE pg_catalog."default" NOT NULL,
    email character varying(255) COLLATE pg_catalog."default" NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    permissions jsonb NOT NULL DEFAULT '[]',
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT admin_pkey PRIMARY KEY (id),
    CONSTRAINT admin_email_key UNIQUE (email),
    CONSTRAINT admin_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.admin
    OWNER to postgres;



    -- Table: public.chat_rooms

-- DROP TABLE IF EXISTS public.chat_rooms;

CREATE TABLE IF NOT EXISTS public.chat_rooms
(
    room_id character varying(255) COLLATE pg_catalog."default" NOT NULL,
    user1_id integer NOT NULL,
    user2_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chat_rooms_pkey PRIMARY KEY (room_id),
    CONSTRAINT fk_user1 FOREIGN KEY (user1_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT fk_user2 FOREIGN KEY (user2_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT check_different_users CHECK (user1_id < user2_id)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.chat_rooms
    OWNER to postgres;




    -- Table: public.contact_form

-- DROP TABLE IF EXISTS public.contact_form;

CREATE TABLE IF NOT EXISTS public.contact_form
(
    contact_form_id integer NOT NULL DEFAULT nextval('contact_form_contact_form_id_seq'::regclass),
    sender_name character varying(255) COLLATE pg_catalog."default" NOT NULL,
    sender_email_address character varying(255) COLLATE pg_catalog."default" NOT NULL,
    sender_contact_no character varying(20) COLLATE pg_catalog."default",
    message text COLLATE pg_catalog."default" NOT NULL,
    created_at timestamp with time zone DEFAULT (now() AT TIME ZONE 'UTC'::text),
    CONSTRAINT contact_form_pkey PRIMARY KEY (contact_form_id)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.contact_form
    OWNER to postgres;



    -- Table: public.creators

-- DROP TABLE IF EXISTS public.creators;

CREATE TABLE IF NOT EXISTS public.creators
(
    creator_id integer NOT NULL DEFAULT nextval('creator_creator_id_seq'::regclass),
    user_id integer,
    full_name character varying(200) COLLATE pg_catalog."default",
    social_platform_type character varying(50) COLLATE pg_catalog."default",
    social_links jsonb,
    niche text[] COLLATE pg_catalog."default",
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    first_name character varying(200) COLLATE pg_catalog."default",
    last_name character varying(200) COLLATE pg_catalog."default",
    profile_image_url text COLLATE pg_catalog."default",
    email character varying(255) COLLATE pg_catalog."default",
    phone_number character varying(18) COLLATE pg_catalog."default",
    user_name character varying(255) COLLATE pg_catalog."default",
    about_me text COLLATE pg_catalog."default",
    worked_with integer,
    rating numeric(3,2),
    bank_account_no character varying(30) COLLATE pg_catalog."default",
    bank_ifsc_code character varying(20) COLLATE pg_catalog."default",
    bank_branch_name character varying(100) COLLATE pg_catalog."default",
    bank_name character varying(250) COLLATE pg_catalog."default",
    bank_account_holder_name character varying(250) COLLATE pg_catalog."default",
    CONSTRAINT creator_pkey PRIMARY KEY (creator_id),
    CONSTRAINT unique_username UNIQUE (user_name),
    CONSTRAINT creator_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT creator_social_platform_type_check CHECK (social_platform_type::text = ANY (ARRAY['youtube'::character varying, 'instagram'::character varying]::text[]))
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.creators
    OWNER to postgres;


-- Table: public.custom_packages

-- DROP TABLE IF EXISTS public.custom_packages;

CREATE TABLE IF NOT EXISTS public.custom_packages
(
    id integer NOT NULL DEFAULT nextval('custom_packages_id_seq'::regclass),
    room_id character varying(255) COLLATE pg_catalog."default" NOT NULL,
    freelancer_id integer NOT NULL,
    creator_id integer NOT NULL,
    price numeric(10,2) NOT NULL,
    status character varying(50) COLLATE pg_catalog."default" DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    responded_at timestamp without time zone,
    expires_at timestamp without time zone,
    service_id integer,
    units integer,
    plan_type character varying COLLATE pg_catalog."default",
    package_intiated_by character varying COLLATE pg_catalog."default",
    initiator_role character varying COLLATE pg_catalog."default",
    service_type character varying COLLATE pg_catalog."default",
    package_type character varying COLLATE pg_catalog."default",
    reason_for_revoke text COLLATE pg_catalog."default",
    reason_for_rejection text COLLATE pg_catalog."default",
    delivery_days integer,
    delivery_time integer,
    updated_at timestamp without time zone,
    CONSTRAINT custom_packages_pkey PRIMARY KEY (id),
    CONSTRAINT custom_packages_creator_fkey FOREIGN KEY (freelancer_id)
        REFERENCES public.freelancer (freelancer_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT custom_packages_recipient_fkey FOREIGN KEY (creator_id)
        REFERENCES public.creators (creator_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT custom_packages_room_fkey FOREIGN KEY (room_id)
        REFERENCES public.chat_rooms (room_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT custom_packages_service_fkey FOREIGN KEY (service_id)
        REFERENCES public.services (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE SET NULL
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.custom_packages
    OWNER to postgres;
 

    -- Table: public.deadline_extension_requested

-- DROP TABLE IF EXISTS public.deadline_extension_requested;

CREATE TABLE IF NOT EXISTS public.deadline_extension_requested
(
    id integer NOT NULL DEFAULT nextval('deadline_extension_requested_id_seq'::regclass),
    project_id integer NOT NULL,
    freelancer_id integer NOT NULL,
    creator_id integer NOT NULL,
    chat_room_id character varying(255) COLLATE pg_catalog."default" NOT NULL,
    new_delivery_date date NOT NULL,
    new_delivery_time time without time zone NOT NULL,
    status character varying(50) COLLATE pg_catalog."default" DEFAULT 'pending'::character varying,
    requested_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    approved_at timestamp without time zone,
    expires_at timestamp without time zone,
    CONSTRAINT deadline_extension_requested_pkey PRIMARY KEY (id),
    CONSTRAINT deadline_extension_creator_fkey FOREIGN KEY (creator_id)
        REFERENCES public.creators (creator_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT deadline_extension_freelancer_fkey FOREIGN KEY (freelancer_id)
        REFERENCES public.freelancer (freelancer_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT deadline_extension_project_fkey FOREIGN KEY (project_id)
        REFERENCES public.projects (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT deadline_extension_room_fkey FOREIGN KEY (chat_room_id)
        REFERENCES public.chat_rooms (room_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT deadline_extension_status_check CHECK (status::text = ANY (ARRAY['pending'::character varying::text, 'accepted'::character varying::text, 'rejected'::character varying::text, 'expired'::character varying::text]))
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.deadline_extension_requested
    OWNER to postgres;


    
-- Table: public.deliverables

-- DROP TABLE IF EXISTS public.deliverables;

CREATE TABLE IF NOT EXISTS public.deliverables
(
    id integer NOT NULL DEFAULT nextval('deliverables_id_seq'::regclass),
    deliverable_url jsonb,
    created_at timestamp with time zone DEFAULT now(),
    project_description text COLLATE pg_catalog."default",
    service_id integer,
    creator_id integer,
    freelancer_id integer,
    project_id integer,
    CONSTRAINT deliverables_pkey PRIMARY KEY (id),
    CONSTRAINT deliverables_creator_id_fkey FOREIGN KEY (creator_id)
        REFERENCES public.creators (creator_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT deliverables_freelancer_id_fkey FOREIGN KEY (freelancer_id)
        REFERENCES public.freelancer (freelancer_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT deliverables_project_id_fkey FOREIGN KEY (project_id)
        REFERENCES public.projects (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT deliverables_service_id_fkey FOREIGN KEY (service_id)
        REFERENCES public.services (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.deliverables
    OWNER to postgres;



    -- Table: public.disputes

-- DROP TABLE IF EXISTS public.disputes;

CREATE TABLE IF NOT EXISTS public.disputes
(
    id integer NOT NULL DEFAULT nextval('disputes_id_seq'::regclass),
    creator_id integer NOT NULL,
    freelancer_id integer NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    reason_of_dispute text COLLATE pg_catalog."default" NOT NULL,
    admin_note jsonb,
    description text COLLATE pg_catalog."default",
    status text COLLATE pg_catalog."default" NOT NULL DEFAULT 'pending'::text,
    raised_by text COLLATE pg_catalog."default" NOT NULL,
    admin_id integer,
    project_id integer,
    is_rejected boolean DEFAULT false,
    CONSTRAINT disputes_pkey PRIMARY KEY (id),
    CONSTRAINT fk_admin FOREIGN KEY (admin_id)
        REFERENCES public.admin (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT fk_disputes_creator FOREIGN KEY (creator_id)
        REFERENCES public.creators (creator_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT fk_disputes_freelancer FOREIGN KEY (freelancer_id)
        REFERENCES public.freelancer (freelancer_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT disputes_raised_by_check CHECK (raised_by = ANY (ARRAY['creator'::text, 'freelancer'::text])),
    CONSTRAINT disputes_status_check CHECK (status = ANY (ARRAY['pending'::text, 'resolved'::text, 'rejected'::text, 'in_review'::text])),
    CONSTRAINT disputes_reason_check CHECK (reason_of_dispute = ANY (ARRAY[
        'Partial Work Done',
        'Report Abuse',
        'Work Not Submitted On Time',
        'Asking For Extra Charges',
        'The project was delivered, but more work is being requested',
        'The creator is requesting work outside my service scope',
        'Demanding Extra Revisions',
        'Other'
    ]))
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.disputes
    OWNER to postgres;

-- Trigger function to auto-set is_rejected when creator rejects
CREATE OR REPLACE FUNCTION set_dispute_rejected()
RETURNS TRIGGER AS $$
BEGIN
    -- If status is 'rejected' and raised_by is 'creator', set is_rejected to true
    IF NEW.status = 'rejected' AND NEW.raised_by = 'creator' THEN
        NEW.is_rejected := true;
    END IF;

    -- Update the updated_at timestamp
    NEW.updated_at := now();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_set_dispute_rejected ON public.disputes;
CREATE TRIGGER trigger_set_dispute_rejected
    BEFORE INSERT OR UPDATE ON public.disputes
    FOR EACH ROW
    EXECUTE FUNCTION set_dispute_rejected();

-- Index for better query performance on common lookups
CREATE INDEX IF NOT EXISTS idx_disputes_status ON public.disputes(status);
CREATE INDEX IF NOT EXISTS idx_disputes_creator_id ON public.disputes(creator_id);
CREATE INDEX IF NOT EXISTS idx_disputes_freelancer_id ON public.disputes(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_disputes_project_id ON public.disputes(project_id);


    -- Table: public.freelancer

-- DROP TABLE IF EXISTS public.freelancer;

-- Table: public.freelancer

-- DROP TABLE IF EXISTS public.freelancer;

CREATE TABLE IF NOT EXISTS public.freelancer
(
    freelancer_id integer NOT NULL DEFAULT nextval('influencer_influencer_id_seq'::regclass),
    user_id integer NOT NULL,
    profile_title text COLLATE pg_catalog."default",
    gov_id_type character varying(50) COLLATE pg_catalog."default",
    gov_id_url text COLLATE pg_catalog."default",
    first_name character varying(100) COLLATE pg_catalog."default",
    last_name character varying(100) COLLATE pg_catalog."default",
    date_of_birth date,
    about_me text COLLATE pg_catalog."default",
    phone_number character varying(15) COLLATE pg_catalog."default",
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_active boolean DEFAULT true,
    last_active date,
    bank_account_no character varying(30) COLLATE pg_catalog."default",
    bank_ifsc_code character varying(20) COLLATE pg_catalog."default",
    bank_branch_name character varying(100) COLLATE pg_catalog."default",
    freelancer_thumbnail_image text COLLATE pg_catalog."default",
    freelancer_full_name character varying(100) COLLATE pg_catalog."default",
    freelancer_email character varying(300) COLLATE pg_catalog."default",
    bank_name character varying(250) COLLATE pg_catalog."default",
    niche character varying[] COLLATE pg_catalog."default",
    gov_id_number character varying(250) COLLATE pg_catalog."default",
    profile_image_url text COLLATE pg_catalog."default",
    razorpay_account_id character varying(255) COLLATE pg_catalog."default",
    verification_status character varying(20) COLLATE pg_catalog."default",
    rating numeric(3,2),
    bank_account_holder_name character varying(250) COLLATE pg_catalog."default",
    reason_for_rejection text COLLATE pg_catalog."default",
    reason_for_suspension text COLLATE pg_catalog."default",
    user_name character varying(255) COLLATE pg_catalog."default",
    worked_with integer DEFAULT 0,
    earnings_balance numeric(15,2) DEFAULT 0.00,
    interested_service character varying[] COLLATE pg_catalog."default",
    available_balance numeric(15,2) DEFAULT 0.00,
    pan_card_number character varying(20) COLLATE pg_catalog."default",
    pan_card_image_url text COLLATE pg_catalog."default",
    razorpay_linked_account_id character varying(50) COLLATE pg_catalog."default",
    razorpay_stakeholder_id character varying(50) COLLATE pg_catalog."default",
    razorpay_product_id character varying(50) COLLATE pg_catalog."default",
    razorpay_account_status character varying(20) COLLATE pg_catalog."default" DEFAULT 'pending'::character varying,
    street_address character varying(255) COLLATE pg_catalog."default",
    city character varying(100) COLLATE pg_catalog."default",
    state character varying(50) COLLATE pg_catalog."default",
    postal_code character varying(10) COLLATE pg_catalog."default",
    razorpay_onboarding_error text COLLATE pg_catalog."default",
    razorpay_onboarding_error_step character varying(30) COLLATE pg_catalog."default",
    razorpay_onboarding_error_at timestamp with time zone,
    CONSTRAINT influencer_pkey PRIMARY KEY (freelancer_id),
    CONSTRAINT unique_freelancer_user_name UNIQUE (user_name),
    CONSTRAINT influencer_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT chk_verification_status CHECK (verification_status::text = ANY (ARRAY['PENDING'::character varying::text, 'VERIFIED'::character varying::text, 'REJECTED'::character varying::text, 'SUSPENDED'::character varying::text]))
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.freelancer
    OWNER to postgres;
-- Index: idx_freelancer_verified_active

-- DROP INDEX IF EXISTS public.idx_freelancer_verified_active;

CREATE INDEX IF NOT EXISTS idx_freelancer_verified_active
    ON public.freelancer USING btree
    (verification_status COLLATE pg_catalog."default" ASC NULLS LAST, is_active ASC NULLS LAST)
    TABLESPACE pg_default;


    -- Table: public.gov_ids

-- DROP TABLE IF EXISTS public.gov_ids;

CREATE TABLE IF NOT EXISTS public.gov_ids
(
    id integer NOT NULL DEFAULT nextval('gov_ids_id_seq'::regclass),
    gov_id_name character varying(255) COLLATE pg_catalog."default" NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT gov_ids_pkey PRIMARY KEY (id),
    CONSTRAINT gov_ids_created_by_fkey FOREIGN KEY (created_by)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE CASCADE
        ON DELETE RESTRICT
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.gov_ids
    OWNER to postgres;


    -- Table: public.impact

-- DROP TABLE IF EXISTS public.impact;

CREATE TABLE IF NOT EXISTS public.impact
(
    impact_id integer NOT NULL DEFAULT nextval('impact_impact_id_seq'::regclass),
    freelancer_id integer NOT NULL,
    service_type character varying(100) COLLATE pg_catalog."default",
    before_service_url text COLLATE pg_catalog."default",
    after_service_url text COLLATE pg_catalog."default",
    impact_metric jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT impact_pkey PRIMARY KEY (impact_id),
    CONSTRAINT impact_freelancer_id_fkey FOREIGN KEY (freelancer_id)
        REFERENCES public.freelancer (freelancer_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.impact
    OWNER to postgres;



    -- Table: public.messages

-- DROP TABLE IF EXISTS public.messages;

CREATE TABLE IF NOT EXISTS public.messages
(
    id integer NOT NULL DEFAULT nextval('messages_id_seq'::regclass),
    room_id character varying(255) COLLATE pg_catalog."default" NOT NULL,
    sender_id integer NOT NULL,
    recipient_id integer NOT NULL,
    message text COLLATE pg_catalog."default" NOT NULL,
    is_read boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    message_type character varying(20) COLLATE pg_catalog."default" DEFAULT 'text'::character varying,
    file_url character varying(255) COLLATE pg_catalog."default",
    custom_package_id integer,
    deadline_extension_id integer,
    CONSTRAINT messages_pkey PRIMARY KEY (id),
    CONSTRAINT fk_deadline_extension FOREIGN KEY (deadline_extension_id)
        REFERENCES public.deadline_extension_requested (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE SET NULL,
    CONSTRAINT fk_recipient FOREIGN KEY (recipient_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT fk_sender FOREIGN KEY (sender_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT messages_custom_package_id_fkey FOREIGN KEY (custom_package_id)
        REFERENCES public.custom_packages (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT messages_room_id_fkey FOREIGN KEY (room_id)
        REFERENCES public.chat_rooms (room_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT messages_message_type_check CHECK (message_type::text = ANY (ARRAY['text'::character varying::text, 'image'::character varying::text, 'file'::character varying::text, 'video'::character varying::text, 'audio'::character varying::text, 'package'::character varying::text, 'deadline_extension'::character varying::text]))
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.messages
    OWNER to postgres;

    -- Table: public.niche

-- DROP TABLE IF EXISTS public.niche;

CREATE TABLE IF NOT EXISTS public.niche
(
    id integer NOT NULL DEFAULT nextval('niche_id_seq'::regclass),
    niche_name character varying(255) COLLATE pg_catalog."default" NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT niche_pkey PRIMARY KEY (id),
    CONSTRAINT niche_created_by_fkey FOREIGN KEY (created_by)
        REFERENCES public.admin (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.niche
    OWNER to postgres;


    -- Table: public.niche_options

-- DROP TABLE IF EXISTS public.niche_options;

CREATE TABLE IF NOT EXISTS public.niche_options
(
    id integer NOT NULL DEFAULT nextval('niche_options_id_seq'::regclass),
    option_name character varying(255) COLLATE pg_catalog."default" NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT niche_options_pkey PRIMARY KEY (id),
    CONSTRAINT fk_niche_options_user FOREIGN KEY (created_by)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE CASCADE
        ON DELETE RESTRICT
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.niche_options
    OWNER to postgres;

    -- Table: public.otp_tokens

-- DROP TABLE IF EXISTS public.otp_tokens;

CREATE TABLE IF NOT EXISTS public.otp_tokens
(
    id integer NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 ),
    email character varying(255) COLLATE pg_catalog."default" NOT NULL,
    otp text COLLATE pg_catalog."default" NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    type character varying(50) COLLATE pg_catalog."default" NOT NULL,
    CONSTRAINT otp_tokens_pkey PRIMARY KEY (id),
    CONSTRAINT otp_tokens_email_type_key UNIQUE (email, type)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.otp_tokens
    OWNER to postgres;


    -- Table: public.payouts

-- DROP TABLE IF EXISTS public.payouts;

-- Payouts Table: Supports Pooled Earnings Model
-- Freelancers accumulate earnings_balance from multiple completed transactions
-- They request partial/full payouts from their available_balance
-- Payout is independent of any single transaction
CREATE TABLE IF NOT EXISTS public.payouts
(
    id integer NOT NULL DEFAULT nextval('payouts_id_seq'::regclass),
    freelancer_id integer NOT NULL,
    amount numeric(15,2) NOT NULL,
    currency character varying(3) COLLATE pg_catalog."default" DEFAULT 'INR'::character varying,
    razorpay_payout_id character varying(255) COLLATE pg_catalog."default",
    razorpay_fund_account_id character varying(255) COLLATE pg_catalog."default",
    status character varying(20) COLLATE pg_catalog."default" DEFAULT 'REQUESTED'::character varying,
    utr character varying(255) COLLATE pg_catalog."default",
    mode character varying(10) COLLATE pg_catalog."default" DEFAULT 'IMPS'::character varying,
    failure_reason text COLLATE pg_catalog."default",
    rejection_reason text COLLATE pg_catalog."default",
    approved_at timestamp with time zone,
    approved_by integer,
    rejected_at timestamp with time zone,
    rejected_by integer,
    initiated_at timestamp with time zone,
    processed_at timestamp with time zone,
    requested_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT payouts_pkey PRIMARY KEY (id),
    CONSTRAINT payouts_freelancer_id_fkey FOREIGN KEY (freelancer_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT payouts_rejected_by_fkey FOREIGN KEY (rejected_by)
        REFERENCES public.admin (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT payouts_status_check CHECK (status::text = ANY (ARRAY['REQUESTED'::character varying, 'QUEUED'::character varying, 'PENDING'::character varying, 'PROCESSING'::character varying, 'PROCESSED'::character varying, 'REVERSED'::character varying, 'FAILED'::character varying, 'CANCELLED'::character varying, 'REJECTED'::character varying]::text[])),
    CONSTRAINT payouts_mode_check CHECK (mode::text = ANY (ARRAY['IMPS'::character varying, 'NEFT'::character varying, 'RTGS'::character varying, 'UPI'::character varying]::text[]))
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.payouts
    OWNER to postgres;


    -- Table: public.platform_settings

-- DROP TABLE IF EXISTS public.platform_settings;

CREATE TABLE IF NOT EXISTS public.platform_settings
(
    id integer NOT NULL DEFAULT nextval('platform_settings_id_seq'::regclass),
    setting_key character varying(100) COLLATE pg_catalog."default" NOT NULL,
    setting_value text COLLATE pg_catalog."default" NOT NULL,
    description text COLLATE pg_catalog."default",
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT platform_settings_pkey PRIMARY KEY (id),
    CONSTRAINT platform_settings_setting_key_key UNIQUE (setting_key)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.platform_settings
    OWNER to postgres;



    -- Table: public.portfolio

-- DROP TABLE IF EXISTS public.portfolio;

CREATE TABLE IF NOT EXISTS public.portfolio
(
    portfolio_item_id integer NOT NULL DEFAULT nextval('portfolio_portfolio_item_id_seq'::regclass),
    freelancer_id integer NOT NULL,
    portfolio_item_service_type character varying(100) COLLATE pg_catalog."default",
    portfolio_item_url text COLLATE pg_catalog."default",
    portfolio_item_description text COLLATE pg_catalog."default",
    portfolio_item_created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    portfolio_item_updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT portfolio_pkey PRIMARY KEY (portfolio_item_id),
    CONSTRAINT portfolio_freelancer_id_fkey FOREIGN KEY (freelancer_id)
        REFERENCES public.freelancer (freelancer_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.portfolio
    OWNER to postgres;


    -- Table: public.projects

-- DROP TABLE IF EXISTS public.projects;

CREATE TABLE IF NOT EXISTS public.projects
(
    id integer NOT NULL DEFAULT nextval('projects_id_seq'::regclass),
    creator_id integer NOT NULL,
    freelancer_id integer NOT NULL,
    number_of_units integer,
    amount numeric(15,2) NOT NULL,
    status character varying(20) COLLATE pg_catalog."default" DEFAULT 'CREATED'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp with time zone,
    end_date timestamp with time zone,
    service_id integer,
    approved_by integer,
    approved_at timestamp with time zone,
    custom_package_id integer,
    CONSTRAINT projects_pkey PRIMARY KEY (id),
    CONSTRAINT fk_projects_service FOREIGN KEY (service_id)
        REFERENCES public.services (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT projects_approved_by_fkey FOREIGN KEY (approved_by)
        REFERENCES public.admin (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT fk_projects_custom_package FOREIGN KEY (custom_package_id)
        REFERENCES public.custom_packages (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE SET NULL,
    CONSTRAINT projects_creator_id_fkey FOREIGN KEY (creator_id)
        REFERENCES public.creators (creator_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT projects_freelancer_id_fkey FOREIGN KEY (freelancer_id)
        REFERENCES public.freelancer (freelancer_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT projects_status_check CHECK (status::text = ANY (ARRAY['CREATED'::text, 'IN_PROGRESS'::text, 'SUBMITTED'::text, 'COMPLETED'::text, 'CANCELLED'::text, 'DISPUTE'::text]))
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.projects
    OWNER to postgres;


    -- Table: public.ratings

-- DROP TABLE IF EXISTS public.ratings;

CREATE TABLE IF NOT EXISTS public.ratings
(
    id integer NOT NULL DEFAULT nextval('ratings_id_seq'::regclass),
    project_id integer NOT NULL,
    freelancer_id integer NOT NULL,
    freelancer_rating numeric(2,1),
    freelancer_review text COLLATE pg_catalog."default",
    creator_id integer NOT NULL,
    creator_rating numeric(2,1),
    creator_review text COLLATE pg_catalog."default",
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ratings_pkey PRIMARY KEY (id),
    CONSTRAINT unique_project_rating UNIQUE (project_id),
    CONSTRAINT fk_ratings_creator FOREIGN KEY (creator_id)
        REFERENCES public.creators (creator_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT fk_ratings_freelancer FOREIGN KEY (freelancer_id)
        REFERENCES public.freelancer (freelancer_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT fk_ratings_project FOREIGN KEY (project_id)
        REFERENCES public.projects (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT ratings_creator_rating_check CHECK (creator_rating >= 0::numeric AND creator_rating <= 5::numeric),
    CONSTRAINT ratings_freelancer_rating_check CHECK (freelancer_rating >= 0::numeric AND freelancer_rating <= 5::numeric)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.ratings
    OWNER to postgres;
-- Index: idx_ratings_creator

-- DROP INDEX IF EXISTS public.idx_ratings_creator;

CREATE INDEX IF NOT EXISTS idx_ratings_creator
    ON public.ratings USING btree
    (creator_id ASC NULLS LAST)
    TABLESPACE pg_default;
-- Index: idx_ratings_freelancer

-- DROP INDEX IF EXISTS public.idx_ratings_freelancer;

CREATE INDEX IF NOT EXISTS idx_ratings_freelancer
    ON public.ratings USING btree
    (freelancer_id ASC NULLS LAST)
    TABLESPACE pg_default;
-- Index: idx_ratings_project

-- DROP INDEX IF EXISTS public.idx_ratings_project;

CREATE INDEX IF NOT EXISTS idx_ratings_project
    ON public.ratings USING btree
    (project_id ASC NULLS LAST)
    TABLESPACE pg_default;



    -- Table: public.razorpay_orders

-- DROP TABLE IF EXISTS public.razorpay_orders;

CREATE TABLE IF NOT EXISTS public.razorpay_orders
(
    id integer NOT NULL DEFAULT nextval('razorpay_orders_id_seq'::regclass),
    user_id integer NOT NULL,
    order_type character varying(20) COLLATE pg_catalog."default" NOT NULL,
    razorpay_order_id character varying(255) COLLATE pg_catalog."default" NOT NULL,
    amount numeric(15,2) NOT NULL,
    currency character varying(3) COLLATE pg_catalog."default" DEFAULT 'INR'::character varying,
    status character varying(20) COLLATE pg_catalog."default" DEFAULT 'CREATED'::character varying,
    receipt character varying(255) COLLATE pg_catalog."default",
    reference_id integer,
    notes text COLLATE pg_catalog."default",
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT razorpay_orders_pkey PRIMARY KEY (id),
    CONSTRAINT razorpay_orders_razorpay_order_id_key UNIQUE (razorpay_order_id),
    CONSTRAINT razorpay_orders_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT razorpay_orders_order_type_check CHECK (order_type::text = ANY (ARRAY['WALLET_LOAD'::character varying, 'SERVICE_PAYMENT'::character varying]::text[])),
    CONSTRAINT razorpay_orders_status_check CHECK (status::text = ANY (ARRAY['CREATED'::character varying, 'ATTEMPTED'::character varying, 'PAID'::character varying, 'FAILED'::character varying]::text[]))
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.razorpay_orders
    OWNER to postgres;



    -- Table: public.service_options

-- DROP TABLE IF EXISTS public.service_options;

CREATE TABLE IF NOT EXISTS public.service_options
(
    id integer NOT NULL DEFAULT nextval('service_options_id_seq'::regclass),
    service_name character varying(255) COLLATE pg_catalog."default" NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    service_title character varying(255) COLLATE pg_catalog."default",
    service_description text COLLATE pg_catalog."default",
    show_on_home_page boolean NOT NULL DEFAULT false,
    images text[] COLLATE pg_catalog."default" DEFAULT ARRAY[]::text[],
    CONSTRAINT service_options_pkey PRIMARY KEY (id),
    CONSTRAINT fk_service_options_created_by FOREIGN KEY (created_by)
        REFERENCES public.admin (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE SET NULL
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.service_options
    OWNER to postgres;


    -- Table: public.service_request_suggestions

-- DROP TABLE IF EXISTS public.service_request_suggestions;

CREATE TABLE IF NOT EXISTS public.service_request_suggestions
(
    suggestion_id integer NOT NULL DEFAULT nextval('service_request_suggestions_suggestion_id_seq'::regclass),
    request_id integer,
    freelancer_id integer[],
    admin_notes text COLLATE pg_catalog."default",
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    admin_id integer,
    CONSTRAINT service_request_suggestions_pkey PRIMARY KEY (suggestion_id),
    CONSTRAINT service_request_suggestions_request_id_key UNIQUE (request_id),
    CONSTRAINT fk_admin FOREIGN KEY (admin_id)
        REFERENCES public.admin (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT service_request_suggestions_request_id_fkey FOREIGN KEY (request_id)
        REFERENCES public.service_requests (request_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.service_request_suggestions
    OWNER to postgres;

    -- Table: public.service_requests

-- DROP TABLE IF EXISTS public.service_requests;

CREATE TABLE IF NOT EXISTS public.service_requests
(
    request_id integer NOT NULL DEFAULT nextval('service_request_request_id_seq'::regclass),
    creator_id integer,
    budget character varying(50) COLLATE pg_catalog."default",
    desired_service character varying(200) COLLATE pg_catalog."default",
    details text COLLATE pg_catalog."default",
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    status character varying(20) COLLATE pg_catalog."default" DEFAULT 'active'::character varying,
    CONSTRAINT service_request_pkey PRIMARY KEY (request_id),
    CONSTRAINT service_request_creator_id_fkey FOREIGN KEY (creator_id)
        REFERENCES public.creators (creator_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT service_request_status_check CHECK (status::text = ANY (ARRAY['active'::character varying, 'completed'::character varying, 'inactive'::character varying, 'inprocess'::character varying, 'assigned'::character varying]::text[]))
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.service_requests
    OWNER to postgres;


    -- Table: public.transactions

-- DROP TABLE IF EXISTS public.transactions;

CREATE TABLE IF NOT EXISTS public.transactions
(
    id integer NOT NULL DEFAULT nextval('transactions_id_seq'::regclass),
    project_id integer NOT NULL,
    creator_id integer NOT NULL,
    freelancer_id integer NOT NULL,
    total_amount numeric(15,2) NOT NULL,
    platform_commission numeric(15,2) NOT NULL,
    platform_commission_percentage numeric(5,2) NOT NULL,
    freelancer_amount numeric(15,2) NOT NULL,
    payment_source character varying(20) COLLATE pg_catalog."default" NOT NULL,
    razorpay_order_id character varying(255) COLLATE pg_catalog."default",
    razorpay_payment_id character varying(255) COLLATE pg_catalog."default",
    status character varying(20) COLLATE pg_catalog."default" DEFAULT 'INITIATED'::character varying,
    held_at timestamp with time zone,
    released_at timestamp with time zone,
    released_by integer,
    settled_at timestamp with time zone,
    payout_id character varying(255) COLLATE pg_catalog."default",
    payout_status character varying(20) COLLATE pg_catalog."default",
    payout_utr character varying(255) COLLATE pg_catalog."default",
    currency character varying(3) COLLATE pg_catalog."default" DEFAULT 'INR'::character varying,
    notes text COLLATE pg_catalog."default",
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT transactions_pkey PRIMARY KEY (id),
    CONSTRAINT transactions_creator_id_fkey FOREIGN KEY (creator_id)
        REFERENCES public.creators (creator_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT transactions_freelancer_id_fkey FOREIGN KEY (freelancer_id)
        REFERENCES public.freelancer (freelancer_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT transactions_project_id_fkey FOREIGN KEY (project_id)
        REFERENCES public.projects (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT transactions_released_by_fkey FOREIGN KEY (released_by)
        REFERENCES public.admin (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT transactions_payment_source_check CHECK (payment_source::text = ANY (ARRAY['WALLET'::character varying, 'RAZORPAY'::character varying]::text[])),
    CONSTRAINT transactions_status_check CHECK (status::text = ANY (ARRAY['INITIATED'::character varying, 'PENDING'::character varying, 'HELD'::character varying, 'RELEASED'::character varying, 'COMPLETED'::character varying, 'FAILED'::character varying, 'REFUNDED'::character varying]::text[])),
    CONSTRAINT transactions_payout_status_check CHECK (payout_status::text = ANY (ARRAY['PENDING'::character varying, 'PROCESSING'::character varying, 'PROCESSED'::character varying, 'FAILED'::character varying]::text[]))
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.transactions
    OWNER to postgres;

    -- Table: public.users

-- DROP TABLE IF EXISTS public.users;

CREATE TABLE IF NOT EXISTS public.users
(
    id integer NOT NULL DEFAULT nextval('users_id_seq'::regclass),
    user_role character varying(50) COLLATE pg_catalog."default" NOT NULL,
    user_email character varying(255) COLLATE pg_catalog."default" NOT NULL,
    user_password character varying(255) COLLATE pg_catalog."default" NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_active boolean NOT NULL DEFAULT true,
    user_name character varying(255) COLLATE pg_catalog."default",
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT unique_user_name UNIQUE (user_name),
    CONSTRAINT users_user_email_key UNIQUE (user_email),
    CONSTRAINT users_user_role_check CHECK (user_role::text = ANY (ARRAY['freelancer'::character varying::text, 'creator'::character varying::text, 'admin'::character varying::text]))
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.users
    OWNER to postgres;


    -- Table: public.wallet_transactions

-- DROP TABLE IF EXISTS public.wallet_transactions;

CREATE TABLE IF NOT EXISTS public.wallet_transactions
(
    id integer NOT NULL DEFAULT nextval('wallet_transactions_id_seq'::regclass),
    wallet_id integer NOT NULL,
    transaction_type character varying(20) COLLATE pg_catalog."default" NOT NULL,
    amount numeric(15,2) NOT NULL,
    balance_before numeric(15,2) NOT NULL,
    balance_after numeric(15,2) NOT NULL,
    reference_type character varying(20) COLLATE pg_catalog."default" NOT NULL,
    reference_id integer,
    description text COLLATE pg_catalog."default",
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT wallet_transactions_pkey PRIMARY KEY (id),
    CONSTRAINT wallet_transactions_wallet_id_fkey FOREIGN KEY (wallet_id)
        REFERENCES public.wallets (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT wallet_transactions_transaction_type_check CHECK (transaction_type::text = ANY (ARRAY['CREDIT'::character varying, 'DEBIT'::character varying]::text[])),
    CONSTRAINT wallet_transactions_reference_type_check CHECK (reference_type::text = ANY (ARRAY['LOAD'::character varying, 'PAYMENT'::character varying, 'REFUND'::character varying, 'WITHDRAWAL'::character varying, 'COMMISSION'::character varying]::text[]))
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.wallet_transactions
    OWNER to postgres;


    -- Table: public.wallets

-- DROP TABLE IF EXISTS public.wallets;

CREATE TABLE IF NOT EXISTS public.wallets
(
    id integer NOT NULL DEFAULT nextval('wallets_id_seq'::regclass),
    creator_id integer NOT NULL,
    balance numeric(15,2) DEFAULT 0.00,
    currency character varying(3) COLLATE pg_catalog."default" DEFAULT 'INR'::character varying,
    status character varying(10) COLLATE pg_catalog."default" DEFAULT 'ACTIVE'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT wallets_pkey PRIMARY KEY (id),
    CONSTRAINT unique_creator_wallet UNIQUE (creator_id),
    CONSTRAINT fk_creator FOREIGN KEY (creator_id)
        REFERENCES public.creators (creator_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT wallets_status_check CHECK (status::text = ANY (ARRAY['ACTIVE'::character varying, 'FROZEN'::character varying, 'CLOSED'::character varying]::text[]))
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.wallets
    OWNER to postgres;
-- Index: idx_creator_id

-- DROP INDEX IF EXISTS public.idx_creator_id;

CREATE INDEX IF NOT EXISTS idx_creator_id
    ON public.wallets USING btree
    (creator_id ASC NULLS LAST)
    TABLESPACE pg_default;



    -- Table: public.web_notifications

-- DROP TABLE IF EXISTS public.web_notifications;

CREATE TABLE IF NOT EXISTS public.web_notifications
(
    id integer NOT NULL DEFAULT nextval('web_notifications_id_seq'::regclass),
    recipient_id integer NOT NULL,
    sender_id integer,
    event_type text COLLATE pg_catalog."default" NOT NULL,
    title text COLLATE pg_catalog."default" NOT NULL,
    body text COLLATE pg_catalog."default" NOT NULL,
    action_type text COLLATE pg_catalog."default" NOT NULL DEFAULT 'none'::text,
    action_route text COLLATE pg_catalog."default",
    is_read boolean NOT NULL DEFAULT false,
    read_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT web_notifications_pkey PRIMARY KEY (id),
    CONSTRAINT web_notifications_recipient_id_fkey FOREIGN KEY (recipient_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT web_notifications_sender_id_fkey FOREIGN KEY (sender_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE SET NULL
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.web_notifications
    OWNER to postgres;
-- Index: idx_notif_feed

-- DROP INDEX IF EXISTS public.idx_notif_feed;

CREATE INDEX IF NOT EXISTS idx_notif_feed
    ON public.web_notifications USING btree
    (recipient_id ASC NULLS LAST, created_at DESC NULLS FIRST)
    TABLESPACE pg_default;
-- Index: idx_notif_unread

-- DROP INDEX IF EXISTS public.idx_notif_unread;

CREATE INDEX IF NOT EXISTS idx_notif_unread
    ON public.web_notifications USING btree
    (recipient_id ASC NULLS LAST, is_read ASC NULLS LAST)
    TABLESPACE pg_default;


    -- Table: public.webhook_logs

-- DROP TABLE IF EXISTS public.webhook_logs;

CREATE TABLE IF NOT EXISTS public.webhook_logs
(
    id integer NOT NULL DEFAULT nextval('webhook_logs_id_seq'::regclass),
    event_type character varying(100) COLLATE pg_catalog."default" NOT NULL,
    razorpay_event_id character varying(255) COLLATE pg_catalog."default",
    payload jsonb,
    processed boolean DEFAULT false,
    error_message text COLLATE pg_catalog."default",
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT webhook_logs_pkey PRIMARY KEY (id)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.webhook_logs
    OWNER to postgres;


    -- Table: public.wishlist

-- DROP TABLE IF EXISTS public.wishlist;

CREATE TABLE IF NOT EXISTS public.wishlist
(
    wishlist_id integer NOT NULL DEFAULT nextval('wishlist_wishlist_id_seq'::regclass),
    freelancer_id integer NOT NULL,
    creator_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT wishlist_pkey PRIMARY KEY (wishlist_id),
    CONSTRAINT unique_creator_freelancer UNIQUE (creator_id, freelancer_id),
    CONSTRAINT fk_creator FOREIGN KEY (creator_id)
        REFERENCES public.creators (creator_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT fk_freelancer FOREIGN KEY (freelancer_id)
        REFERENCES public.freelancer (freelancer_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.wishlist
    OWNER to postgres;

CREATE TABLE IF NOT EXISTS public.featured_freelancers
(
    id SERIAL PRIMARY KEY,
    freelancer_id INTEGER NOT NULL,
    service_option_id INTEGER NOT NULL,
    priority INTEGER,  -- 1-5 when active, NULL when inactive
    is_active BOOLEAN NOT NULL DEFAULT true,
    featured_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    unfeatured_at TIMESTAMP WITHOUT TIME ZONE,  -- when removed/bumped
    featured_by INTEGER,
    unfeatured_by INTEGER,  -- admin who removed

    CONSTRAINT fk_featured_freelancer FOREIGN KEY (freelancer_id)
        REFERENCES public.freelancer (freelancer_id) ON DELETE CASCADE,
    CONSTRAINT fk_featured_service_option FOREIGN KEY (service_option_id)
        REFERENCES public.service_options (id) ON DELETE CASCADE,
    CONSTRAINT fk_featured_by FOREIGN KEY (featured_by)
        REFERENCES public.admin (id) ON DELETE SET NULL,
    CONSTRAINT fk_unfeatured_by FOREIGN KEY (unfeatured_by)
        REFERENCES public.admin (id) ON DELETE SET NULL,

    CONSTRAINT chk_priority CHECK (priority BETWEEN 1 AND 5)
);

-- Freelancer can only be ACTIVELY featured once per service
CREATE UNIQUE INDEX uq_active_freelancer_per_service
    ON featured_freelancers (freelancer_id, service_option_id)
    WHERE is_active = true;

-- Only one freelancer per priority slot per service (among active)
CREATE UNIQUE INDEX uq_active_priority_per_service
    ON featured_freelancers (service_option_id, priority)
    WHERE is_active = true;

CREATE INDEX idx_featured_active ON featured_freelancers (service_option_id, priority)
    WHERE is_active = true;


    CREATE TABLE IF NOT EXISTS public.support_assignments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL,
    admin_id INTEGER NOT NULL,
    room_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_support_user 
        FOREIGN KEY (user_id) 
        REFERENCES public.users(id) 
        ON DELETE CASCADE,
    
    CONSTRAINT fk_support_admin 
        FOREIGN KEY (admin_id) 
        REFERENCES public.users(id) 
        ON DELETE CASCADE,
    
    CONSTRAINT fk_support_room 
        FOREIGN KEY (room_id) 
        REFERENCES public.chat_rooms(room_id) 
        ON DELETE CASCADE
);

CREATE INDEX idx_support_user_lookup ON support_assignments(user_id);
CREATE INDEX idx_support_admin_lookup ON support_assignments(admin_id);