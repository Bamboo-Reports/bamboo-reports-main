# Supabase Saved Filters Setup

This guide documents the implementation of the "Saved Filters" feature, which allows users to persist their complex filter configurations. It uses a dedicated table in Supabase with a `JSONB` column to store the flexible filter state.

> **Context:** Used by `components/saved-filters-manager.tsx` and `app/actions.ts`.

---

## 1. Schema Reference

### 1.1 Table: `saved_filters`

| Column | Type | Nullable | Notes |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | **NO** | Primary Key. Defaults to `gen_random_uuid()`. |
| `user_id` | `UUID` | **NO** | Foreign Key to `auth.users`. Ensures filters belong to a specific user. |
| `name` | `TEXT` | **NO** | User-defined name for the filter set (e.g., "Q4 Tech Prospects"). |
| `filters` | `JSONB` | **NO** | The raw filter state object. **Crucial:** See JSON Structure below. |
| `created_at` | `TIMESTAMPTZ` | **NO** | Default `now()`. |
| `updated_at` | `TIMESTAMPTZ` | **NO** | Default `now()`. Auto-updated via trigger. |

### 1.2 SQL Definition

```sql
-- Ensure UUID extension is available
create extension if not exists "pgcrypto";

create table if not exists public.saved_filters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  filters jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Performance Index: Quickly fetch a user's filters sorted by newest first
create index if not exists saved_filters_user_created_idx
  on public.saved_filters (user_id, created_at desc);
```

---

## 2. JSONB Structure (`filters` column)

The `filters` column stores the **Application State**, not the Database Schema. Therefore, keys use `camelCase` matching the React state, even though the database tables use `snake_case`.

**Interface (TypeScript):**
```typescript
interface FilterValue {
  value: string;
  mode: "include" | "exclude";
}

interface Filters {
  // Accounts
  accountVisibilityMode: "all" | "gcc" | "nonGcc";
  accountHqCountryValues: FilterValue[];
  accountHqIndustryValues: FilterValue[];
  accountDataCoverageValues: FilterValue[];
  accountSourceValues: FilterValue[];
  accountPrimaryCategoryValues: FilterValue[];
  accountPrimaryNatureValues: FilterValue[];
  accountNasscomStatusValues: FilterValue[];
  accountHqEmployeeRangeValues: FilterValue[];
  accountCenterEmployeesRangeValues: FilterValue[];
  accountHqRevenueRange: [number, number]; // e.g., [0, 1000000]
  accountHqRevenueIncludeNull: boolean;
  accountYearsInIndiaRange: [number, number];
  yearsInIndiaIncludeNull: boolean;
  accountGlobalLegalNameKeywords: FilterValue[];

  // Centers
  centerTypeValues: FilterValue[];
  centerFocusValues: FilterValue[];
  centerCityValues: FilterValue[];
  centerStateValues: FilterValue[];
  centerCountryValues: FilterValue[];
  centerEmployeesRangeValues: FilterValue[];
  centerStatusValues: FilterValue[];
  centerIncYearRange: [number, number];
  centerIncYearIncludeNull: boolean;
  
  // Functions
  functionNameValues: FilterValue[];
  techSoftwareInUseKeywords: FilterValue[];
  
  // Prospects
  prospectDepartmentValues: FilterValue[];
  prospectLevelValues: FilterValue[];
  prospectCityValues: FilterValue[];
  prospectTitleKeywords: FilterValue[];
}
```

---

## 3. Security (RLS Policies)

Row Level Security ensures users can only access their own saved filters.

```sql
alter table public.saved_filters enable row level security;

-- SELECT: Users see only their own filters
create policy "Saved filters are private"
  on public.saved_filters for select
  using (auth.uid() = user_id);

-- INSERT: Users can create filters only for themselves
create policy "Users can insert their saved filters"
  on public.saved_filters for insert
  with check (auth.uid() = user_id);

-- UPDATE: Users can update only their own filters
create policy "Users can update their saved filters"
  on public.saved_filters for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- DELETE: Users can delete only their own filters
create policy "Users can delete their saved filters"
  on public.saved_filters for delete
  using (auth.uid() = user_id);
```

---

## 4. Maintenance

### 4.1 Auto-Update Trigger
Keeps `updated_at` current.

```sql
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_saved_filters_updated_at on public.saved_filters;
create trigger set_saved_filters_updated_at
before update on public.saved_filters
for each row execute function public.set_updated_at();
```

### 4.2 Application Integration
- **Saving:** The frontend serializes the entire `filters` state object to JSON and sends it to Supabase.
- **Loading:** The frontend fetches the JSON, parses it, runs it through `withFilterDefaults` to ensure required keys and range defaults are present, and then sanitizes disabled keys before applying it to the dashboard state.

### 4.3 Deployment Access and Premium Filter Sanitization

Saved filters are intentionally forward-compatible with deployment packaging changes.

- If a whole section is disabled via `lib/config/dashboard-access.ts`, any saved-filter keys for that section are ignored at load/runtime.
- If premium filters are disabled via `showMoreEnabled: false` in `lib/config/filters.ts`, any keys listed in that section's `premiumFilterKeys` are ignored at load/runtime.
- No database migration is required when packaging changes. Existing `saved_filters.filters` JSON payloads remain valid; inaccessible keys are simply treated as inert.
- This also means inaccessible keys do not contribute to active-filter counts or result filtering after load.

---

## 5. Filter Sharing

### 5.1 Table: `filter_shares`

Enables users to share saved filter configurations with specific teammates by email.

| Column | Type | Nullable | Notes |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | **NO** | Primary Key. Defaults to `gen_random_uuid()`. |
| `filter_id` | `UUID` | **NO** | FK to `saved_filters(id)`. CASCADE on delete. |
| `owner_user_id` | `UUID` | **NO** | FK to `auth.users(id)`. The user who shared the filter. |
| `shared_with_user_id` | `UUID` | **NO** | FK to `auth.users(id)`. The recipient user. |
| `shared_with_email` | `TEXT` | **NO** | Email of the recipient (for display purposes). |
| `created_at` | `TIMESTAMPTZ` | **NO** | Default `now()`. |

**Unique constraint:** `(filter_id, shared_with_user_id)` — a filter can only be shared once per recipient.

**Lookup helper:** `public.lookup_profile_by_email(input_email text)` performs a case-insensitive exact email lookup for the share flow. The migration also adds `profiles_email_lower_idx` on `lower(email)` so lookups stay index-friendly.

### 5.2 SQL Definition

```sql
CREATE TABLE IF NOT EXISTS public.filter_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filter_id UUID NOT NULL REFERENCES public.saved_filters(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(filter_id, shared_with_user_id)
);
```

### 5.3 RLS Policies

```sql
-- Owners can manage their shares
CREATE POLICY "Owners can manage their shares"
  ON public.filter_shares FOR ALL
  USING (auth.uid() = owner_user_id);

-- Recipients can view shares directed at them
CREATE POLICY "Recipients can view their shares"
  ON public.filter_shares FOR SELECT
  USING (auth.uid() = shared_with_user_id);

-- Recipients can read the shared filter data from saved_filters
CREATE POLICY "Users can view filters shared with them"
  ON public.saved_filters FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.filter_shares
      WHERE filter_shares.filter_id = saved_filters.id
        AND filter_shares.shared_with_user_id = auth.uid()
    )
  );
```

### 5.4 Sharing Flow

1. **Share:** Owner clicks Share on a saved filter → enters recipient email → app looks up `profiles` table → creates `filter_shares` record.
2. **View:** Recipient sees shared filters in a "Shared with me" section in the saved filters dropdown.
3. **Load:** Recipient can load shared filters (read-only — cannot edit or delete the original).
4. **Revoke:** Owner can view who they've shared with and remove access.

### 5.5 Migration

See `documentation/sql/filter-shares-migration.sql` for the complete migration script.
