-- Tracks the one "your appointment has ended, mark it complete" nudge each
-- booking gets (see app/api/cron/completion-nudges).
alter table bookings
  add column if not exists completion_nudge_sent_at timestamptz;
