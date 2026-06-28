-- Migration: add project_revisions table + revision message type

-- 1. New table to store revision history (supports multiple revisions per project)
CREATE TABLE IF NOT EXISTS public.project_revisions (
    id            SERIAL PRIMARY KEY,
    project_id    integer NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    creator_id    integer NOT NULL REFERENCES public.creators(creator_id),
    freelancer_id integer NOT NULL REFERENCES public.freelancer(freelancer_id),
    chat_room_id  varchar(255) REFERENCES public.chat_rooms(room_id),
    revision_message text NOT NULL,
    days          integer NOT NULL DEFAULT 0,
    hours         integer NOT NULL DEFAULT 0,
    new_end_date  timestamp with time zone NOT NULL,
    requested_at  timestamp with time zone DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_revisions_project_id ON public.project_revisions(project_id);

-- 2. Add 'revision' to messages.message_type check constraint
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_message_type_check
    CHECK (message_type::text = ANY (ARRAY[
        'text'::text,
        'image'::text,
        'file'::text,
        'video'::text,
        'audio'::text,
        'package'::text,
        'deadline_extension'::text,
        'revision'::text
    ]));
