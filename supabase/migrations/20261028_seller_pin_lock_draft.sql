begin;

-- PIN migration: additive-only objects, schema reviewed against the active Supabase project 2026-10-28.
-- Creates private PIN metadata and restricted RPCs; does not modify sales, customers, devices,
-- memberships, or existing business records. Apply only to the approved project.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.gestao_seller_pin_credentials (
  business_id uuid not null,
  seller_id uuid not null,
  bcrypt_hash text not null,
  offline_salt_hex text not null check (offline_salt_hex ~ '^[0-9a-f]{32}$'),
  offline_pbkdf2_hash_hex text,
  revision bigint not null default 1,
  rotated_at timestamptz not null default now(),
  rotated_by uuid not null references auth.users(id),
  primary key (business_id,seller_id),
  foreign key (business_id,seller_id) references public.gestao_sellers(business_id,id) on delete cascade,
  check (offline_pbkdf2_hash_hex is null or offline_pbkdf2_hash_hex ~ '^[0-9a-f]{64}$')
);
create table if not exists public.gestao_seller_pin_attempts (
  device_id uuid primary key references public.gestao_devices(id) on delete cascade,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  blocked_until timestamptz,
  last_failed_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.gestao_seller_pin_credentials enable row level security;
alter table public.gestao_seller_pin_attempts enable row level security;
revoke all on public.gestao_seller_pin_credentials from public,anon,authenticated;
revoke all on public.gestao_seller_pin_attempts from public,anon,authenticated;

-- Owner-only PIN generation/rotation (confirmed active roles in current project). The generated six-digit PIN is returned
-- once; only a bcrypt hash is stored. Salt returned for client-side PBKDF2-SHA256
-- offline verifier (600,000 iterations). Increment revision invalidates old caches.
create or replace function public.gestao_generate_seller_pin(p_business_id uuid,p_seller_id uuid)
returns table(pin text,offline_salt_hex text,revision bigint)
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_pin text; v_salt text; v_revision bigint; v_rand bytea;
begin
 if auth.uid() is null or not exists(select 1 from public.gestao_memberships m where m.user_id=auth.uid() and m.business_id=p_business_id and m.active=true and m.role='owner') then raise exception 'manager authorization required' using errcode='42501'; end if;
 if not exists(select 1 from public.gestao_sellers s where s.business_id=p_business_id and s.id=p_seller_id and s.active=true) then raise exception 'active seller not found'; end if;
 if not exists(select 1 from public.gestao_devices d where d.business_id=p_business_id and d.seller_id=p_seller_id and d.active=true) then raise exception 'active bound seller device required'; end if;
 loop v_rand:=extensions.gen_random_bytes(4); exit when ((get_byte(v_rand,0)::bigint*16777216)+(get_byte(v_rand,1)::bigint*65536)+(get_byte(v_rand,2)::bigint*256)+get_byte(v_rand,3)::bigint)<4294000000; end loop; v_pin:=lpad((((get_byte(v_rand,0)::bigint*16777216)+(get_byte(v_rand,1)::bigint*65536)+(get_byte(v_rand,2)::bigint*256)+get_byte(v_rand,3)::bigint) % 1000000)::text,6,'0'); v_salt:=encode(extensions.gen_random_bytes(16),'hex');
 insert into public.gestao_seller_pin_credentials(business_id,seller_id,bcrypt_hash,offline_salt_hex,offline_pbkdf2_hash_hex,revision,rotated_at,rotated_by)
 values(p_business_id,p_seller_id,extensions.crypt(v_pin,extensions.gen_salt('bf',12)),v_salt,null,1,now(),auth.uid())
 on conflict(business_id,seller_id) do update set bcrypt_hash=excluded.bcrypt_hash,offline_salt_hex=excluded.offline_salt_hex,offline_pbkdf2_hash_hex=null,revision=public.gestao_seller_pin_credentials.revision+1,rotated_at=now(),rotated_by=auth.uid()
 returning public.gestao_seller_pin_credentials.revision into v_revision;
 return query select v_pin,v_salt,v_revision;
end $$;

-- Called by manager after calculating PBKDF2 from the one-time PIN and salt.
-- Server keeps the only fetchable offline verifier alongside the bcrypt hash.
create or replace function public.gestao_set_seller_pin_offline_verifier(p_business_id uuid,p_seller_id uuid,p_revision bigint,p_verifier_hex text)
returns void language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 if auth.uid() is null or not exists(select 1 from public.gestao_memberships m where m.user_id=auth.uid() and m.business_id=p_business_id and m.active=true and m.role='owner') then raise exception 'manager authorization required' using errcode='42501'; end if;
 if not exists(select 1 from public.gestao_sellers s where s.business_id=p_business_id and s.id=p_seller_id and s.active=true) then raise exception 'active seller not found'; end if;
 if not exists(select 1 from public.gestao_devices d where d.business_id=p_business_id and d.seller_id=p_seller_id and d.active=true) then raise exception 'active bound seller device required'; end if;
 if p_verifier_hex is null or p_verifier_hex !~ '^[0-9a-f]{64}$' then raise exception 'invalid verifier'; end if;
 update public.gestao_seller_pin_credentials set offline_pbkdf2_hash_hex=p_verifier_hex where business_id=p_business_id and seller_id=p_seller_id and revision=p_revision;
 if not found then raise exception 'PIN rotation changed or seller not found'; end if;
end $$;

-- Device verifier fetch derives the binding from auth.uid(); caller-supplied
-- IDs must match that active device. Returns only salt, PBKDF2 verifier and revision.
create or replace function public.gestao_get_seller_pin_verifier(p_business_id uuid,p_seller_id uuid,p_device_id uuid)
returns table(salt_hex text,verifier_hex text,version bigint)
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare d public.gestao_devices%rowtype; a public.gestao_seller_pin_attempts%rowtype;
begin
 select * into d from public.gestao_devices where id=p_device_id and auth_user_id=auth.uid() and active=true and business_id=p_business_id and seller_id=p_seller_id;
 if not found then raise exception 'active device authorization required' using errcode='42501'; end if;
 select * into a from public.gestao_seller_pin_attempts where device_id=d.id;
 if found and a.blocked_until is not null and a.blocked_until>now() then raise exception 'PIN attempts temporarily limited'; end if;
 return query select c.offline_salt_hex,c.offline_pbkdf2_hash_hex,c.revision from public.gestao_seller_pin_credentials c where c.business_id=d.business_id and c.seller_id=d.seller_id and c.offline_pbkdf2_hash_hex is not null;
end $$;

-- Online verifier: server-side bcrypt check and enforced lockout. The seller's
-- device is derived from auth.uid(); it cannot ask for another seller's PIN.
create or replace function public.gestao_verify_seller_pin(p_pin text)
returns boolean language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare d public.gestao_devices%rowtype; a public.gestao_seller_pin_attempts%rowtype; h text;
begin
 if auth.uid() is null then raise exception 'active device authorization required' using errcode='42501'; end if;
 if p_pin is null or p_pin !~ '^\d{6}$' then
   select * into d from public.gestao_devices where auth_user_id=auth.uid() and active=true;
   if not found then raise exception 'active device authorization required' using errcode='42501'; end if;
   insert into public.gestao_seller_pin_attempts(device_id,failed_attempts,last_failed_at,updated_at) values(d.id,1,now(),now())
   on conflict(device_id) do update set failed_attempts=case when gestao_seller_pin_attempts.blocked_until>now() then gestao_seller_pin_attempts.failed_attempts when gestao_seller_pin_attempts.blocked_until is not null and gestao_seller_pin_attempts.blocked_until<=now() then 1 else gestao_seller_pin_attempts.failed_attempts+1 end,last_failed_at=case when gestao_seller_pin_attempts.blocked_until>now() then gestao_seller_pin_attempts.last_failed_at else now() end,updated_at=case when gestao_seller_pin_attempts.blocked_until>now() then gestao_seller_pin_attempts.updated_at else now() end,blocked_until=case when gestao_seller_pin_attempts.blocked_until>now() then gestao_seller_pin_attempts.blocked_until when gestao_seller_pin_attempts.blocked_until is not null and gestao_seller_pin_attempts.blocked_until<=now() then null when gestao_seller_pin_attempts.failed_attempts+1>=5 then now()+least(interval '15 minutes',interval '30 seconds'*power(2,greatest(0,least(5,gestao_seller_pin_attempts.failed_attempts-4)))) else null end;
   return false;
 end if;
 select * into d from public.gestao_devices where auth_user_id=auth.uid() and active=true;
 if not found then raise exception 'active device authorization required' using errcode='42501'; end if;
 select * into a from public.gestao_seller_pin_attempts where device_id=d.id;
 if found and a.blocked_until is not null and a.blocked_until>now() then return false; end if;
 select bcrypt_hash into h from public.gestao_seller_pin_credentials where business_id=d.business_id and seller_id=d.seller_id;
 if h is not null and extensions.crypt(p_pin,h)=h then
   delete from public.gestao_seller_pin_attempts where device_id=d.id;
   return true;
 end if;
 insert into public.gestao_seller_pin_attempts(device_id,failed_attempts,last_failed_at,updated_at) values(d.id,1,now(),now())
 on conflict(device_id) do update set failed_attempts=case when gestao_seller_pin_attempts.blocked_until>now() then gestao_seller_pin_attempts.failed_attempts when gestao_seller_pin_attempts.blocked_until is not null and gestao_seller_pin_attempts.blocked_until<=now() then 1 else gestao_seller_pin_attempts.failed_attempts+1 end,last_failed_at=case when gestao_seller_pin_attempts.blocked_until>now() then gestao_seller_pin_attempts.last_failed_at else now() end,updated_at=case when gestao_seller_pin_attempts.blocked_until>now() then gestao_seller_pin_attempts.updated_at else now() end,blocked_until=case when gestao_seller_pin_attempts.blocked_until>now() then gestao_seller_pin_attempts.blocked_until when gestao_seller_pin_attempts.blocked_until is not null and gestao_seller_pin_attempts.blocked_until<=now() then null when gestao_seller_pin_attempts.failed_attempts+1>=5 then now()+least(interval '15 minutes',interval '30 seconds'*power(2,greatest(0,least(5,gestao_seller_pin_attempts.failed_attempts-4)))) else null end;
 return false;
end $$;

-- Online failure throttle keyed by the authenticated device. Not an online PIN
-- verifier; malicious browser code can lie, and offline trials cannot be enforced.
create or replace function public.gestao_note_seller_pin_failure(p_device_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare d public.gestao_devices%rowtype;
begin
 select * into d from public.gestao_devices where id=p_device_id and auth_user_id=auth.uid() and active=true;
 if not found then raise exception 'active device authorization required' using errcode='42501'; end if;
 if exists(select 1 from public.gestao_seller_pin_attempts a where a.device_id=d.id and a.blocked_until>now()) then return; end if;
 insert into public.gestao_seller_pin_attempts(device_id,failed_attempts,last_failed_at,updated_at) values(d.id,1,now(),now())
 on conflict(device_id) do update set failed_attempts=case when gestao_seller_pin_attempts.blocked_until>now() then gestao_seller_pin_attempts.failed_attempts when gestao_seller_pin_attempts.blocked_until is not null and gestao_seller_pin_attempts.blocked_until<=now() then 1 else gestao_seller_pin_attempts.failed_attempts+1 end,last_failed_at=case when gestao_seller_pin_attempts.blocked_until>now() then gestao_seller_pin_attempts.last_failed_at else now() end,updated_at=case when gestao_seller_pin_attempts.blocked_until>now() then gestao_seller_pin_attempts.updated_at else now() end,blocked_until=case when gestao_seller_pin_attempts.blocked_until>now() then gestao_seller_pin_attempts.blocked_until when gestao_seller_pin_attempts.blocked_until is not null and gestao_seller_pin_attempts.blocked_until<=now() then null when gestao_seller_pin_attempts.failed_attempts+1>=5 then now()+least(interval '15 minutes',interval '30 seconds'*power(2,greatest(0,least(5,gestao_seller_pin_attempts.failed_attempts-4)))) else null end;
end $$;

revoke all on function public.gestao_generate_seller_pin(uuid,uuid) from public,anon;
revoke all on function public.gestao_set_seller_pin_offline_verifier(uuid,uuid,bigint,text) from public,anon;
revoke all on function public.gestao_get_seller_pin_verifier(uuid,uuid,uuid) from public;
revoke all on function public.gestao_note_seller_pin_failure(uuid) from public;
revoke all on function public.gestao_verify_seller_pin(text) from public,anon;
grant execute on function public.gestao_generate_seller_pin(uuid,uuid) to authenticated;
grant execute on function public.gestao_set_seller_pin_offline_verifier(uuid,uuid,bigint,text) to authenticated;
grant execute on function public.gestao_get_seller_pin_verifier(uuid,uuid,uuid) to authenticated;
grant execute on function public.gestao_note_seller_pin_failure(uuid) to authenticated;
grant execute on function public.gestao_verify_seller_pin(text) to authenticated;

commit;
