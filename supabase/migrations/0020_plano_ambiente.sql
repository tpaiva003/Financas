-- Plano do ambiente, para o registo aberto poder ter tectos.
--
-- Abrir o registo a qualquer pessoa sem limites transformava a app em alojamento
-- gratuito de dados financeiros de desconhecidos: custa dinheiro, cria obrigações
-- de RGPD sobre dados que ninguém pediu para guardar, e convida a abuso.
--
-- 'free' tem tectos (ver src/lib/domain/limits.ts), 'full' não tem.
alter table spaces
  add column if not exists plan text not null default 'free';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'spaces_plan_check'
  ) then
    alter table spaces
      add constraint spaces_plan_check check (plan in ('free', 'full'));
  end if;
end $$;

-- Os ambientes que já existem são de gente que entrou por convite, antes de
-- haver registo aberto. Não levam tectos: um limite novo nunca pode aparecer
-- por baixo de dados que já lá estavam.
update spaces set plan = 'full' where plan = 'free';

comment on column spaces.plan is
  'free = com tectos (ver domain/limits.ts). full = sem tectos. Um tecto impede de criar mais, nunca apaga o que existe.';
