-- Jalankan seluruh SQL ini di Supabase Dashboard > SQL Editor.
create table if not exists public.products (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 category text default '',
 sku text default '',
 buy_price numeric(14,2) not null default 0 check (buy_price >= 0),
 sell_price numeric(14,2) not null default 0 check (sell_price >= 0),
 stock integer not null default 0 check (stock >= 0),
 min_stock integer not null default 5 check (min_stock >= 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.stock_movements (
 id uuid primary key default gen_random_uuid(),
 product_id uuid references public.products(id) on delete set null,
 product_name text not null,
 type text not null check (type in ('in','out')),
 quantity integer not null check (quantity > 0),
 note text default '',
 created_at timestamptz not null default now()
);
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;
drop policy if exists "signed in users manage products" on public.products;
create policy "signed in users manage products" on public.products for all to authenticated using (true) with check (true);
drop policy if exists "signed in users manage movements" on public.stock_movements;
create policy "signed in users manage movements" on public.stock_movements for all to authenticated using (true) with check (true);
