-- NodeXchange node: registered devices, encrypted inbox, contacts.
-- Only the `nx` edge function (service role) touches these tables: RLS is on
-- with no policies, so the public API keys cannot read or write them.

create extension if not exists pg_cron;

create table public.nx_devices (
  address    text primary key,
  cert_body  text not null,
  cert_sig   text not null,
  updated_at timestamptz not null default now()
);

create table public.nx_messages (
  id          uuid primary key,
  recipient   text not null references public.nx_devices (address) on delete cascade,
  sender      text not null,
  envelope    jsonb not null,
  sender_cert jsonb not null,
  is_request  boolean not null,
  created_at  timestamptz not null default now(),
  read_at     timestamptz,
  -- 15 days while unread, 48 hours once read
  expires_at  timestamptz not null
);

create index nx_messages_inbox on public.nx_messages (recipient, expires_at);
create index nx_messages_pair on public.nx_messages (recipient, sender, created_at);

create table public.nx_contacts (
  owner      text not null references public.nx_devices (address) on delete cascade,
  peer       text not null,
  status     text not null check (status in ('accepted', 'blocked')),
  updated_at timestamptz not null default now(),
  primary key (owner, peer)
);

alter table public.nx_devices enable row level security;
alter table public.nx_messages enable row level security;
alter table public.nx_contacts enable row level security;

select cron.schedule(
  'nx-expire-messages',
  '*/15 * * * *',
  $$delete from public.nx_messages where expires_at < now()$$
);
