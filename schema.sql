-- Run this once in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 100),
  author text not null check (char_length(author) between 2 and 60),
  description text not null default '' check (char_length(description) <= 500),
  ingredients text[] not null check (cardinality(ingredients) between 1 and 30),
  instructions text[] not null check (cardinality(instructions) between 1 and 20),
  category text not null check (category in ('Breakfast','Lunch','Dinner','Dessert','Snack')),
  prep_minutes integer not null check (prep_minutes between 1 and 1440),
  servings integer not null check (servings between 1 and 100),
  image_url text check (image_url is null or image_url like 'https://%'),
  delete_token_hash text not null,
  created_at timestamptz not null default now()
);

-- Add the token hash field to an existing recipes table. Existing rows remain readable;
-- deletion is available for recipes created after this feature is installed.
alter table public.recipes add column if not exists delete_token_hash text;

create index if not exists recipes_created_at_idx on public.recipes (created_at desc);
create index if not exists recipes_category_idx on public.recipes (category);

-- The Express server uses the secret server-side key. Browser/anon roles get no table access.
alter table public.recipes enable row level security;
revoke all on table public.recipes from anon, authenticated;
grant all on table public.recipes to service_role;
