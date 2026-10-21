-- 0024 Crédito à habitação: períodos de taxa e maturidade.
--
-- O que faltava. Uma dívida guardava UMA taxa (`interest_rate_pct`) e um tipo
-- (`rate_kind`: fixa ou variável). Um crédito à habitação português típico não
-- tem uma taxa — tem duas ou três, com datas: "3 anos fixa a 3,3%, depois
-- Euribor 6M + 0,9% até 2055". Com uma taxa só, a app mostrava até ao fim do
-- prazo uma prestação que deixa de ser verdade no dia em que o período fixo
-- acaba, e uns juros totais que nunca vão ser esses. Um número errado com ar de
-- resposta é o modo de falha que esta app já pagou para aprender.
--
-- **Porquê `jsonb` e não uma tabela.** Os períodos só fazem sentido dentro do
-- crédito a que pertencem, são dois ou três, e são sempre lidos e escritos
-- inteiros — nunca se procura "todos os períodos variáveis do universo". Uma
-- tabela dava integridade referencial que aqui não paga o que custa.
--
-- O preço do `jsonb` é o Postgres devolver o que lá estiver, escrito por esta
-- versão da app ou por outra qualquer. Por isso a leitura passa toda pelo
-- `parseCreditTerms` (`domain/credito.ts`), que valida campo a campo e deita
-- fora o que não percebe. Um `as unknown as` aqui daria um plano de amortização
-- com números a sério e origem duvidosa.
--
-- Forma do objeto:
--   {
--     "periods": [
--       { "startsOn": "2026-01-01", "kind": "fixa", "ratePct": 3.3 },
--       { "startsOn": "2029-01-01", "kind": "variavel",
--         "indexante": "euribor6m", "spreadPct": 0.9 }
--     ],
--     "indexanteRates": { "euribor6m": 2.1 }
--   }
--
-- `indexanteRates` é o valor de HOJE de cada indexante, escrito por quem
-- registou o crédito. A Euribor daqui a três anos ninguém sabe: o plano diz que
-- daí para a frente é um cenário, e a que valor foi feito.
--
-- `interest_rate_pct` e `rate_kind` ficam onde estão e continuam a valer para
-- todas as outras dívidas (crédito pessoal, automóvel) e para os bens que
-- rendem juros. Só quando há `credit_terms` é que mandam os períodos.

alter table assets
  -- Data do último pagamento. Ao contrário de `term_months`, não envelhece: um
  -- prazo em meses guardado em 2020 já não é o prazo que falta hoje.
  add column if not exists maturity_date date,
  add column if not exists credit_terms jsonb;

comment on column assets.maturity_date is
  'Crédito: data do último pagamento. Não envelhece, ao contrário de term_months.';
comment on column assets.credit_terms is
  'Crédito: { periods: RatePeriod[], indexanteRates: {} }. Ler SEMPRE via parseCreditTerms.';
