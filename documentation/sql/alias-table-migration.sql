-- Alias table for account name variants sourced from the "alias" sheet.
-- Relationship/source-of-truth: documentation/table-relationships.md and
-- etl/V2/main.py. The alias row identity is account_global_legal_name; uuid is
-- retained as import metadata and must not be treated as the primary key.

create table if not exists public.alias (
  uuid text,
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

create unique index if not exists alias_account_global_legal_name_key
  on public.alias (account_global_legal_name);

create index if not exists alias_account_name_idx
  on public.alias (account_global_legal_name);
