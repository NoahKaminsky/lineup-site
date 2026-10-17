-- Verification now asks for two files: the credential (or proof of
-- enrollment) and a government-issued photo ID, so reviewers can match the
-- document to the person. The ID lives in the same private bucket.
--
-- Until this runs, /api/verification/submit still accepts submissions and
-- records the ID's storage path in admin_note instead.

alter table professional_verifications
  add column if not exists id_document_path text;
