-- 0019 As cotações passam a saber em que moeda estão.
--
-- Faltava, e não era um pormenor: o Yahoo devolve o MSFT em dólares, e o preço
-- ia direto para o ativo como se fossem euros. Uma ação americana a 536,92 USD
-- aparecia como 536,92 EUR, e o património ficava inflacionado quase 10% sem
-- ninguém dar por isso. Numa app de finanças, um número errado que se apresenta
-- como certo é o pior resultado possível.
--
-- Guarda-se a moeda de origem e o fecho **nessa moeda**. A conversão para euros
-- é feita à taxa do dia da cotação, com as taxas de referência do BCE, e não à
-- taxa de hoje: uma compra de há dois anos vale o que valia, não o que valeria
-- se tivesse sido feita hoje.

alter table quotes add column if not exists currency text not null default 'EUR';

-- O que já lá está veio da Stooq (bloqueada) ou do Yahoo sem moeda registada.
-- Apaga-se para ser buscado de novo com a moeda certa: uma cotação sem moeda
-- conhecida não é utilizável, e adivinhar era repetir o erro.
delete from quotes where currency = 'EUR' and symbol not like '%.de';
