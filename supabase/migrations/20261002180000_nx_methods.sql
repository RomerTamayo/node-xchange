-- Public external payment methods (e.g. a BEP20 deposit address), stored as
-- the signed "methods" request so clients can verify the device sent them.
alter table public.nx_devices
  add column methods_req text,
  add column methods_sig text;
