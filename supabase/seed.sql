-- Reference-data seed for DeviceLifeline (scaffold; not used by Increment 1).
insert into public.plans (id, name, device_limit) values
  ('free',       'Free',       1),
  ('pro',        'Pro',        3),
  ('developer',  'Developer',  5),
  ('technician', 'Technician', null),
  ('business',   'Business',   null)
on conflict (id) do nothing;
