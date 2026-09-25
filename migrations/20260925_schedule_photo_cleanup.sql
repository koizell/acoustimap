-- Run after deploying cleanup-noise-photos and creating these Vault secrets:
--   acoustimap_project_url          = https://<project-ref>.supabase.co
--   acoustimap_photo_cleanup_token  = same random token as PHOTO_CLEANUP_TOKEN
-- The function rejects requests without that token.
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'acoustimap_project_url')
    or not exists (select 1 from vault.decrypted_secrets where name = 'acoustimap_photo_cleanup_token') then
    raise exception 'Create acoustimap_project_url and acoustimap_photo_cleanup_token in Vault first';
  end if;

  if exists (select 1 from cron.job where jobname = 'cleanup-noise-photos') then
    perform cron.unschedule('cleanup-noise-photos');
  end if;

  perform cron.schedule('cleanup-noise-photos', '15 * * * *', $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'acoustimap_project_url')
        || '/functions/v1/cleanup-noise-photos',
      headers := jsonb_build_object(
        'Content-type', 'application/json',
        'x-cleanup-token', (select decrypted_secret from vault.decrypted_secrets where name = 'acoustimap_photo_cleanup_token')
      ),
      body := '{}'::jsonb
    );
  $job$);
end $$;
