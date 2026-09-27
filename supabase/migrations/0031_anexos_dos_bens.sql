-- 0031 Anexos nos bens: escrituras, cadernetas, contratos, notas de liquidação.
--
-- TABELA E NÃO COLUNA. Uma despesa tem UM recibo, e por isso `receipt_path` é
-- uma coluna. Um imóvel tem escritura, caderneta predial, contrato de crédito e
-- notas de liquidação, acrescentados ao longo de anos e apagados um a um.
--
-- Um `jsonb` com uma lista repetia dois erros que esta app já pagou: seria lido
-- com um `as unknown as`, que não valida nada; e duas pessoas do mesmo ambiente
-- a anexar ao mesmo tempo reescreviam o array uma por cima da outra — o segundo
-- ficheiro desaparecia calado, que é o modo de falha que os invariantes proíbem
-- ("duas transações diferentes nunca viram uma").
--
-- O CAMINHO NO STORAGE É `<space_id>/<asset_id>/<id>.<ext>`, e a ordem importa:
-- apagar um ambiente é remover o prefixo `<space_id>/`, e apagar um bem é
-- remover `<space_id>/<asset_id>/`. Sem o space_id à cabeça, apagar uma conta
-- não conseguiria encontrar os ficheiros — e "apagamos os teus dados" passava a
-- ser falso. É o que já acontece com os recibos.
--
-- O NOME DO FICHEIRO NUNCA É O NOME ORIGINAL. "Escritura Rua X 3Dto NIF 123.pdf"
-- é ele próprio um dado pessoal, e a listagem de um bucket não é sítio para ele.
-- Fica em `file_name`, para a descarga o devolver ao browser.
--
-- `status` existe porque o ficheiro é enviado DIRETAMENTE para o Storage, sem
-- passar pela app: as Server Actions do Next têm um tecto de 1 MB e uma função
-- da Vercel ~4,5 MB, e uma escritura digitalizada passa os dois. A linha é
-- criada em 'a-enviar', e só passa a 'pronto' quando o envio é confirmado. Um
-- anexo que fique em 'a-enviar' nunca é mostrado nem descarregado.

create table if not exists asset_attachments (
  id            text primary key,
  space_id      text not null references spaces(id) on delete cascade,
  asset_id      text not null references assets(id) on delete cascade,
  file_name     text not null,
  content_type  text not null,
  size_bytes    bigint not null default 0,
  storage_path  text not null,
  status        text not null default 'a-enviar',
  created_by    text,
  created_at    timestamptz not null default now()
);

create index if not exists asset_attachments_asset_idx on asset_attachments (asset_id);
create index if not exists asset_attachments_space_idx on asset_attachments (space_id);

comment on table asset_attachments is
  'Ficheiros anexados a um bem. Uma linha por ficheiro: um bem tem vários, acrescentados ao longo de anos e apagados um a um.';
comment on column asset_attachments.storage_path is
  '<space_id>/<asset_id>/<id>.<ext>. O space_id vem à cabeça porque é a unidade de limpeza ao apagar uma conta.';
comment on column asset_attachments.file_name is
  'O nome original, só para a descarga o devolver ao browser. Nunca é usado como caminho: o nome de uma escritura é ele próprio um dado pessoal.';
comment on column asset_attachments.status is
  'a-enviar | pronto. O ficheiro vai direto para o Storage sem passar pela app; só conta depois de o envio ser confirmado.';

alter table asset_attachments enable row level security;
drop policy if exists asset_attachments_all on asset_attachments;
create policy asset_attachments_all on asset_attachments
  for all using (is_app_user()) with check (is_app_user());

-- O BUCKET FICA AQUI, e não criado à mão na consola.
--
-- O bucket dos recibos foi criado à mão e não existe em migração nenhuma: quem
-- montasse o projeto de raiz ficava com uma app que aceita ficheiros e não tem
-- onde os pôr, e só descobria no primeiro upload. Não se repete.
--
-- O tecto de tamanho e a lista de tipos ficam no PRÓPRIO bucket, além da
-- verificação no servidor: como o envio é direto para o Storage, esta é a única
-- camada que sobrevive a um cliente que fale com ele sem passar pela app.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'asset-attachments',
  'asset-attachments',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
