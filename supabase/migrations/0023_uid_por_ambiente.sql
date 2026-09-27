-- A deduplicação de despesas passa a ser por ambiente.
--
-- O índice da 0001_init é global:
--
--   create unique index expenses_uid_unique on expenses (uid) where deleted_at is null;
--
-- e a chave canónica que gera o `uid` é `origem|data|valor|moeda|conta|descrição`
-- — sem o ambiente lá dentro. Enquanto a app foi de duas pessoas numa casa só,
-- isso era indistinguível de "por ambiente". Deixou de ser: dois ambientes que
-- importem a mesma linha do mesmo banco no mesmo dia produzem o mesmo uid, e o
-- segundo simplesmente não entra. Uma pessoa perde uma despesa por causa de
-- outra que não conhece, e o saldo fica errado sem nada a assinalar.
--
-- O dedup ao nível da aplicação já é por ambiente (ver `import-service.ts`); era
-- só a restrição da base de dados que não era.

drop index if exists expenses_uid_unique;

create unique index if not exists expenses_space_uid_unique
  on expenses (space_id, uid) where deleted_at is null;

comment on index expenses_space_uid_unique is
  'A mesma transação não entra duas vezes NO MESMO ambiente. Entre ambientes não há relação nenhuma: a mesma linha do mesmo banco pode legitimamente existir em dois sítios.';
