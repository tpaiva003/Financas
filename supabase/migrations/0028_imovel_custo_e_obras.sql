-- 0028 Imóveis: o que custou, as obras, e o sítio exato do índice.
--
-- O PROBLEMA. O formulário do imóvel pedia "valor atual" e uma "taxa anual de
-- rendimento" — perguntas que não fazem sentido numa casa. O que se sabe mesmo
-- sobre um imóvel é O QUE SE PAGOU POR ELE e O QUE SE METEU EM OBRAS. O valor de
-- hoje não se sabe: estima-se.
--
-- A CONTA. valor ≈ (compra + obras) × (índice de hoje / índice na data da
-- compra), com o índice a ser o valor mediano por m² que o INE publica para
-- aquele sítio. O ponto de partida é um facto (a escritura); só a variação vem
-- da estatística.
--
-- PORQUÊ ISTO E NÃO "ÁREA × PREÇO DA ZONA". A mediana aplicada à área diz quanto
-- valeria uma casa MÉDIA daquele tamanho naquela zona — e uma casa concreta não
-- é a média: pode ser um T2 sem elevador ou um último andar remodelado, e entre
-- as duas vão 30%. As duas contas continuam a aparecer lado a lado, porque
-- discordarem uma da outra é informação.
--
-- `price_ref_geocod` guarda o código do sítio escolhido no INE. Sem ele não há
-- como ir buscar o índice de 2023 — o nome não chega, porque há nomes repetidos
-- entre níveis (Odivelas é concelho e é freguesia lá dentro).

alter table assets
  add column if not exists purchase_price_cents bigint,
  add column if not exists works_cents bigint,
  add column if not exists price_ref_geocod text;

comment on column assets.purchase_price_cents is
  'O que se pagou pelo imóvel. É o ponto de partida do valor estimado, e é um facto, ao contrário do valor de hoje.';
comment on column assets.works_cents is
  'O que se meteu em obras desde a compra. Entra no custo pelo que custou; não se valoriza desde a escritura.';
comment on column assets.price_ref_geocod is
  'O código do sítio no INE. Sem ele não há como ir buscar o índice da data da compra: o nome não chega, há nomes repetidos entre níveis.';
