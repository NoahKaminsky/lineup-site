-- Chair openings become applications. Safe to re-run.
--
--   chair_openings.requirements     what the shop is looking for (free text)
--   chair_openings.resume_required  applicants must attach a resume
--   chair_applications.years_experience, available_from,
--     preferred_arrangement         filled in by the pro when applying
--   chair_applications.resume_path  file in the private chair-resumes bucket;
--                                   the shop opens it through a short-lived
--                                   signed link, never a public URL

alter table chair_openings
  add column if not exists requirements text check (requirements is null or char_length(requirements) <= 1000),
  add column if not exists resume_required boolean not null default false;

alter table chair_applications
  add column if not exists years_experience integer check (years_experience is null or (years_experience between 0 and 60)),
  add column if not exists available_from date,
  add column if not exists preferred_arrangement text check (preferred_arrangement is null or preferred_arrangement in ('booth_rent', 'commission', 'either')),
  add column if not exists resume_path text;

-- Private: uploads go through signed upload tokens from the server, so no
-- storage policies are needed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chair-resumes',
  'chair-resumes',
  false,
  5242880,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;
