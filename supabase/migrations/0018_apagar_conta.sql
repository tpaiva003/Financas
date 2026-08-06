-- 0018 Apagar uma conta deixa de rebentar contra as chaves estrangeiras.
--
-- Sintoma: carregar em "Apagar dados" (ou em "Retirar acesso") não fazia nada,
-- em silêncio. Causa: todas as chaves estrangeiras para `app_users` eram
-- NO ACTION, e o código só desligava uma delas (`members.linked_user_id`).
-- Bastava a pessoa ter criado um ambiente, uma despesa ou um acerto para o
-- DELETE ser recusado pela base de dados. O erro era apanhado e deitado fora,
-- e a página recarregava igual.
--
-- A decisão de fundo: **`created_by` é proveniência, não propriedade.** Diz
-- quem registou aquilo, e não deve poder impedir que uma pessoa seja apagada.
-- Numa app partilhada, apagar as despesas de quem sai desequilibrava contas
-- alheias que já podem ter sido acertadas, por isso os registos ficam e o que
-- desaparece é a ligação à pessoa. É também o que um pedido de RGPD pede:
-- apagar a identificação, não reescrever a contabilidade de terceiros.
--
-- Para isso, `expenses.created_by` e `settlements.created_by` passam a aceitar
-- nulos. Uma despesa sem autor lê-se como "registada por alguém que já cá não
-- está", que é a verdade.

alter table expenses    alter column created_by drop not null;
alter table settlements alter column created_by drop not null;

alter table spaces      drop constraint if exists spaces_created_by_fkey;
alter table spaces      add  constraint spaces_created_by_fkey
  foreign key (created_by) references app_users(id) on delete set null;

alter table expenses    drop constraint if exists expenses_created_by_fkey;
alter table expenses    add  constraint expenses_created_by_fkey
  foreign key (created_by) references app_users(id) on delete set null;

alter table settlements drop constraint if exists settlements_created_by_fkey;
alter table settlements add  constraint settlements_created_by_fkey
  foreign key (created_by) references app_users(id) on delete set null;

alter table audit_log   drop constraint if exists audit_log_actor_id_fkey;
alter table audit_log   add  constraint audit_log_actor_id_fkey
  foreign key (actor_id) references app_users(id) on delete set null;

-- `members.linked_user_id` também: o código já o desliga à mão antes de apagar,
-- mas depender disso é depender de não haver enganos. A base de dados garante.
alter table members     drop constraint if exists members_linked_user_id_fkey;
alter table members     add  constraint members_linked_user_id_fkey
  foreign key (linked_user_id) references app_users(id) on delete set null;
