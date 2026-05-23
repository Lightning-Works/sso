-- Comic loans: time-limited off-chain access grants from NFT owners to
-- other signed-in users. The owner stays on-chain owner; the platform
-- grants the borrower read access for the term of the loan.
--
-- Status is derived in code from the timestamps:
--   revoked  : revoked_at set
--   returned : returned_at set
--   expired  : now() >= expires_at
--   active   : accepted_at set, none of the above
--   pending  : created, not yet accepted

create table if not exists comic_loans (
  id                uuid primary key default gen_random_uuid(),
  loan_code         text unique not null,             -- random token in /loan/<code>
  contract_address  text not null,
  token_id          text not null,
  owner_user_id     uuid not null references auth.users(id) on delete cascade,
  invitee_label     text,                             -- optional email/phone the owner typed
  borrower_user_id  uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  accepted_at       timestamptz,
  expires_at        timestamptz not null,
  returned_at       timestamptz,
  revoked_at        timestamptz
);

create index if not exists idx_comic_loans_owner    on comic_loans(owner_user_id);
create index if not exists idx_comic_loans_borrower on comic_loans(borrower_user_id);
create index if not exists idx_comic_loans_token    on comic_loans(contract_address, token_id);
create index if not exists idx_comic_loans_code     on comic_loans(loan_code);

-- All access goes through server-side service-role endpoints which enforce
-- the owner/borrower checks themselves. No direct anon/auth policies.
alter table comic_loans enable row level security;
