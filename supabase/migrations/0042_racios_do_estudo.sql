-- 0042 Os rácios da empresa, guardados com o estudo.
--
-- O QUE ISTO RESOLVE. A folha de cálculo que esta app substitui tinha uma
-- coluna a comparar cada empresa com o setor dela, e essa coluna nunca chegou a
-- existir aqui — porque médias setoriais a sério não existem em fonte gratuita
-- nenhuma, e inventá-las produzia números com o tamanho certo, ar de facto, e
-- sem forma de serem conferidos.
--
-- O QUE EXISTE E SE PODE CONFERIR é o que a própria pessoa já estudou. Os
-- rácios já passam pelo ecrã sempre que se carrega em «Buscar dados
-- financeiros» — e depois eram deitados fora com a página. Guardados aqui,
-- cada estudo novo passa a poder perguntar "isto é melhor ou pior do que
-- aquilo que eu já vi neste setor?", que é a decisão que se está mesmo a tomar.
--
-- POR QUE RAZÃO FICAM NO ESTUDO E NÃO NO BEM. Um rácio não é uma propriedade da
-- empresa que dure para sempre: é o que ela mostrava NAQUELE DIA, e é assim que
-- tem de ser lido três anos depois. A tabela dos estudos já tem `study_date` e
-- já congela os pressupostos e o resultado pela mesma razão — estes números
-- pertencem ao mesmo instantâneo.
--
-- TUDO NULO, E DE PROPÓSITO. Um estudo escrito à mão, sem passar pela busca de
-- dados, não tem rácios nenhuns — e não é um estudo pior por isso. A comparação
-- simplesmente não o inclui, e diz sobre quantas empresas assenta.

alter table valuations
  -- O setor como a fonte lhe chama, em inglês, igual ao dos bens. A tradução
  -- vive no código, para um nome novo da fonte chegar ao ecrã como está.
  add column if not exists sector                 text,
  add column if not exists roce_pct               numeric,
  add column if not exists operating_margin_pct   numeric,
  add column if not exists fcf_margin_pct         numeric,
  add column if not exists fcf_growth_pct         numeric;

comment on column valuations.sector is
  'Setor da empresa no dia do estudo, como a fonte lhe chama. Serve para comparar um estudo novo com os anteriores do mesmo setor.';
comment on column valuations.roce_pct is
  'Retorno sobre o capital empregue, médio no historial que a fonte deu. Nulo num estudo escrito à mão — e isso não o torna pior.';
