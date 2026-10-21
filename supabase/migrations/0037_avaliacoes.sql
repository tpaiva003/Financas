-- 0037 Avaliações: o funil de empresas estudadas, com os pressupostos guardados.
--
-- O QUE ISTO RESOLVE. A calculadora de avaliação era uma folha de rascunho: os
-- números viviam enquanto o separador estava aberto e desapareciam com ele. Uma
-- folha de cálculo tem exactamente o mesmo problema, só que mais devagar — o
-- ficheiro fica, mas a decisão que saiu dele não, e três meses depois já ninguém
-- sabe se aquela empresa foi descartada por cara, por má, ou se só ficou por
-- rever.
--
-- UM ESTUDO É UM REGISTO DATADO E NÃO UM VALOR VIVO. Guardam-se os pressupostos
-- **e** o resultado que saiu deles. Guardar só os pressupostos e recalcular na
-- leitura parecia mais limpo e tinha uma consequência séria: no dia em que a
-- fórmula mudasse, um valor que já serviu de base a uma compra mudava de opinião
-- retroactivamente. Uma decisão tomada com 344 tem de continuar a poder ser lida
-- com 344.
--
-- REAVALIAR CRIA UMA LINHA NOVA. Não há chave única por símbolo de propósito:
-- ver "valia 344 em fevereiro e 410 em agosto" é metade do valor disto. O código
-- marca a mais antiga como substituída (`montarFunil`), o que é uma questão de
-- apresentação e não de armazenamento.
--
-- OS CENÁRIOS VÃO EM `jsonb` E O RESTO EM COLUNAS. Os três cenários são uma
-- lista de tamanho fixo que só se lê inteira; o resto são números que se
-- ordenam, filtram e somam. E quem lê o `jsonb` valida-o campo a campo em vez de
-- lhe chamar um tipo: dados guardados por versões antigas chegam incompletos, e
-- `undefined >= 0` é `false`, que se lê como "esta coluna não existe".
--
-- `numeric` E NÃO `double precision` nas percentagens e nas ações, pela mesma
-- razão de sempre: uma taxa de desconto de 8,5 tem de voltar a ser 8,5.
--
-- O `space_id` VAI NA TABELA e é ele que faz o isolamento entre ambientes, porque
-- tudo corre com a chave de serviço, que ignora o RLS. Um método que procure por
-- id sem o filtrar é uma falha de segurança, não um descuido.

create table if not exists valuations (
  id                    text primary key,
  space_id              text not null references spaces(id) on delete cascade,
  -- Pode não haver: uma empresa fechada ou um negócio sem bolsa avaliam-se na
  -- mesma, e é aí que o nome é a única coisa que a identifica.
  symbol                text,
  name                  text not null,
  stage                 text not null default 'estudo',
  -- O dia do estudo, não o instante em que a linha foi escrita. É por ele que
  -- se ordena e é dele que sai a idade dos pressupostos.
  study_date            date not null,

  -- Os pressupostos, para o estudo se poder rever e refazer.
  fcf_cents             bigint not null,
  shares                numeric not null check (shares > 0),
  net_debt_cents        bigint not null,
  discount_pct          numeric not null,
  perpetual_pct         numeric not null,
  years                 integer not null check (years between 1 and 20),
  margin_pct            numeric not null check (margin_pct >= 0 and margin_pct < 100),
  scenarios             jsonb not null,

  -- O resultado que saiu deles, congelado. Ver o comentário lá em cima.
  weighted_price_cents  bigint not null,
  price_at_study_cents  bigint,
  upside_pct            numeric,

  notes                 text,
  created_by            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists valuations_space_idx on valuations (space_id, study_date desc);
create index if not exists valuations_symbol_idx on valuations (space_id, symbol);

comment on table valuations is
  'Estudos de avaliação de empresas, com os pressupostos e o resultado congelados no dia em que foram feitos. Reavaliar cria uma linha nova; o código marca a anterior como substituída.';
comment on column valuations.stage is
  'radar | estudo | esperar | comprada | arquivada. Onde é que a decisão está, que é o que uma folha de cálculo nunca guardava.';
comment on column valuations.weighted_price_cents is
  'O preço ponderado pelas probabilidades, já com a margem de segurança. Congelado: uma decisão tomada com este número tem de continuar a poder ser lida com ele.';

alter table valuations enable row level security;
drop policy if exists valuations_all on valuations;
create policy valuations_all on valuations
  for all using (is_app_user()) with check (is_app_user());
