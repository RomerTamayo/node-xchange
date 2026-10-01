-- Public profile (display alias), stored exactly as the user's device signed it
-- so clients can verify it; the node cannot forge or alter it.
alter table public.nx_devices
  add column profile_req text,
  add column profile_sig text;
