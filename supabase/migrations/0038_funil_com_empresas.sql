-- 0038 O funil passa a começar antes do DCF: empresa, data, notas e anexos.
--
-- O QUE ISTO RESOLVE. A 0037 fez do funil um arquivo de estudos: só entrava lá
-- uma empresa depois de alguém ter feito um DCF completo. Mas o funil serve
-- primeiro para o oposto — apontar uma empresa que se reparou hoje, antes de se
-- saber nada dela, e só mais tarde a estudar. Com a tabela como estava, essa
-- primeira nota não tinha onde ficar, e o passo mais barato do processo era o
-- único que a app não suportava.
--
-- POR ISSO OS PRESSUPOSTOS PASSAM A PODER SER NULOS. Uma linha sem `fcf_cents`
-- é uma empresa em radar; uma com todos é um estudo feito. **O que NÃO se relaxa
-- é a relação entre eles**: ou estão todos preenchidos ou nenhum está, e há um
-- `check` a garanti-lo. Sem essa regra ficava-se com meio estudo — um preço
-- ponderado calculado a partir de um fluxo de caixa que já lá não está — que é
-- exactamente o género de número errado com ar de resposta que esta app existe
-- para não produzir.
--
-- `estudado_em` E `study_date` SÃO COISAS DIFERENTES, e por isso são duas
-- colunas. A `study_date` da 0037 passa a ser o dia em que a empresa entrou no
-- funil (que é o que se ordena e o que envelhece); a `valued_at` é o dia em que
-- o DCF foi feito. Numa linha que só tem a primeira, a segunda é nula — e o ecrã
-- sabe que não há estudo nenhum a envelhecer.
--
-- O `space_id` continua a ser o que faz o isolamento entre ambientes, aqui e na
-- tabela nova dos anexos: tudo corre com a chave de serviço, que ignora o RLS.

alter table valuations
  alter column fcf_cents            drop not null,
  alter column shares               drop not null,
  alter column net_debt_cents       drop not null,
  alter column discount_pct         drop not null,
  alter column perpetual_pct        drop not null,
  alter column years                drop not null,
  alter column margin_pct           drop not null,
  alter column scenarios            drop not null,
  alter column weighted_price_cents drop not null;

-- O dia em que o DCF foi feito, quando há DCF. Ver o comentário lá em cima.
alter table valuations add column if not exists valued_at date;
-- O domínio da marca, para o logo. Mesmo campo e mesma ideia dos investimentos.
alter table valuations add column if not exists logo_domain text;
-- O que a IA leu nos anexos. Guardado com a data para não se ler um resumo de
-- há seis meses como se fosse do documento que se carregou ontem.
alter table valuations add column if not exists ai_summary text;
alter table valuations add column if not exists ai_summary_at timestamptz;

-- Ou o estudo está inteiro, ou não existe. Meio estudo é pior do que nenhum:
-- um preço ponderado sobrevive à remoção do fluxo de caixa que o produziu e
-- fica no ecrã como um número que ninguém consegue explicar.
alter table valuations drop constraint if exists valuations_estudo_inteiro;
alter table valuations add constraint valuations_estudo_inteiro check (
  (fcf_cents is null and shares is null and net_debt_cents is null
   and discount_pct is null and perpetual_pct is null and years is null
   and margin_pct is null and scenarios is null and weighted_price_cents is null)
  or
  (fcf_cents is not null and shares is not null and net_debt_cents is not null
   and discount_pct is not null and perpetual_pct is not null and years is not null
   and margin_pct is not null and scenarios is not null and weighted_price_cents is not null)
);

comment on column valuations.valued_at is
  'O dia do DCF. Nulo numa empresa que ainda só está apontada — e é isso que distingue "sem estudo" de "estudo velho".';

-- ---------------------------------------------------------------------------
-- Anexos de uma avaliação.
--
-- TABELA PRÓPRIA E NÃO UMA COLUNA A MAIS EM `asset_attachments`. Um anexo de um
-- bem aponta obrigatoriamente para um bem; acrescentar-lhe um `valuation_id`
-- opcional deixava a tabela com duas colunas em que uma tem de estar preenchida
-- e a outra não — e nenhuma consulta existente saberia disso. Uma empresa em
-- radar nem sequer é um bem: ainda não se comprou nada.
--
-- O CAMINHO NO STORAGE É `<space_id>/avaliacoes/<valuation_id>/<id>.<ext>`, com
-- o space_id à cabeça pela mesma razão da 0031: é a unidade de limpeza quando se
-- apaga uma conta.

create table if not exists valuation_attachments (
  id            text primary key,
  space_id      text not null references spaces(id) on delete cascade,
  valuation_id  text not null references valuations(id) on delete cascade,
  file_name     text not null,
  content_type  text not null,
  size_bytes    bigint not null,
  storage_path  text not null,
  -- 'a-enviar' até o browser confirmar que o ficheiro subiu. Uma linha que fique
  -- eternamente assim é um envio que falhou, e não um anexo que existe.
  status        text not null default 'a-enviar',
  -- O texto que se conseguiu extrair, para a IA poder resumir sem voltar a
  -- descarregar o ficheiro a cada pergunta.
  extracted_text text,
  created_by    text,
  created_at    timestamptz not null default now()
);

create index if not exists valuation_attachments_val_idx on valuation_attachments (valuation_id);
create index if not exists valuation_attachments_space_idx on valuation_attachments (space_id);

comment on table valuation_attachments is
  'Documentos de uma avaliação: relatórios, apresentações, notas. O texto extraído fica guardado para a IA não ter de reler o ficheiro a cada pergunta.';

alter table valuation_attachments enable row level security;
drop policy if exists valuation_attachments_all on valuation_attachments;
create policy valuation_attachments_all on valuation_attachments
  for all using (is_app_user()) with check (is_app_user());
