-- Run once in the hosted Supabase SQL editor after enabling pg_cron and pg_net.
-- Create these Vault secrets first using your real project URL and a strong
-- random secret that matches the SMS_CRON_SECRET Edge Function secret:
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<Supabase publishable key>', 'publishable_key');
--   select vault.create_secret('<random-secret>', 'sms_cron_secret');
--
-- Runs every five minutes; the function drains small batches only from 8 AM to
-- 5 PM Asia/Manila and returns quickly outside that window. The function remains in application
-- dry-run mode until sms_config.dry_run is deliberately changed by an admin.

select cron.schedule(
  'sms-daily-reminders',
  '*/5 * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
        || '/functions/v1/sms-dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
        'x-sms-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sms_cron_secret')
      ),
      body := '{"action":"scheduled"}'::jsonb,
      timeout_milliseconds := 55000
    ) as request_id;
  $$
);
