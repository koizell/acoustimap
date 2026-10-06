-- Reparación para bases donde ya se añadió kind sin su permiso SELECT.
-- No concede acceso a client_id, no cambia políticas ni desactiva RLS.
begin;
grant select (kind) on public.noise_reports to anon, authenticated;
notify pgrst, 'reload schema';
commit;
