-- Alias table for account name variants sourced from the "alias" sheet.
-- Each row holds alternate names/brands for a single account, linked to
-- public.accounts by account_global_legal_name (the accounts PK).

create table if not exists public.alias (
  uuid text primary key,
  account_global_legal_name text not null
    references public.accounts (account_global_legal_name)
    on update cascade
    on delete cascade,
  short_legal_name text,
  brand_name text,
  abbreviated_name text,
  flagship_products text,
  currently_known_as text,
  notes text
);

create index if not exists alias_account_global_legal_name_idx
  on public.alias (account_global_legal_name);
