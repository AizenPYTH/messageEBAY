-- Weekend / unattended autopilot toggle per app user.
alter table ebay_ai.app_profiles
  add column if not exists autopilot_enabled boolean not null default false;

alter table ebay_ai.app_profiles
  add column if not exists autopilot_updated_at timestamptz;

alter table ebay_ai.app_profiles
  add column if not exists autopilot_last_run_at timestamptz;

alter table ebay_ai.app_profiles
  add column if not exists autopilot_last_run_summary text;
