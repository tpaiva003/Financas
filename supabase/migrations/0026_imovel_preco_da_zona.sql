-- 0026 Imóveis: área, localização e preço de referência da zona.
--
-- O PROBLEMA. Um imóvel fica registado pelo valor que alguém lhe pôs — o da
-- escritura, quase sempre — e nunca mais se mexe. Ao fim de uns anos o
-- património tem lá uma casa avaliada ao preço de 2019, e ninguém repara porque
-- o número continua lá com o mesmo ar de sempre.
--
-- Com a área e o concelho, e com o preço mediano por m² que o INE publica, a app
-- passa a poder dizer quanto é que a casa valeria à mediana da zona.
--
-- O QUE ISTO NÃO É: UMA AVALIAÇÃO. A mediana do concelho não sabe se a casa é
-- num último andar com vista ou num rés do chão para as traseiras, se está
-- pronta ou a precisar de tudo — e a diferença entre uma coisa e outra é
-- facilmente 30%. Por isso `price_ref_cents` **não substitui** `value_cents`:
-- vive ao lado dele e a estimativa é mostrada como estimativa. Trocar um valor
-- desatualizado, que se sabe desatualizado, por um número errado com ar de facto
-- seria uma troca má.
--
-- `price_ref_source` guarda de onde veio e de quando é ("INE · Lisboa · 2025").
-- Um preço de referência sem proveniência é indistinguível de um palpite, e daqui
-- a dois anos ninguém saberia se aquilo ainda vale.

alter table assets
  add column if not exists area_m2 numeric,
  add column if not exists location text,
  add column if not exists price_ref_cents bigint,
  add column if not exists price_ref_source text;

comment on column assets.area_m2 is
  'Área do imóvel em metros quadrados. Com o preço por m², dá a estimativa da zona.';
comment on column assets.location is
  'Concelho, como se escreve. Serve para casar com o nome que o INE devolve.';
comment on column assets.price_ref_cents is
  'Preço de referência por m², em cêntimos. NUNCA substitui value_cents: a estimativa mostra-se ao lado do valor registado.';
comment on column assets.price_ref_source is
  'De onde veio o preço e de quando é ("INE · Lisboa · 2025"). Sem proveniência, um preço de referência é indistinguível de um palpite.';
