-- 0008 — Role de submissão com aprovação (REQ: participante limitado).
-- Um participante pode ter acesso "submitter": submete despesas (escolhendo
-- pagador/divisão entre os membros plenos) que ficam PENDENTES de aprovação por
-- um membro pleno. Submitters não participam no saldo (não pagam nem devem).

alter table members
  add column if not exists role text not null default 'full'; -- 'full' | 'submitter'

alter table expenses
  add column if not exists approval_status text,                 -- null=aprovada; 'pending'; 'rejected'
  add column if not exists approver_id text references members(id),
  add column if not exists submitted_by text references members(id);

create index if not exists expenses_approval_idx
  on expenses (space_id, approval_status);
