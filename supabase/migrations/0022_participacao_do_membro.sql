-- Desde quando é que cada pessoa divide despesas.
--
-- O PROBLEMA. O saldo dividia cada despesa pela lista de membros ATUAL, e a
-- despesa não guarda quem participou nela. Acrescentar uma terceira pessoa a um
-- ambiente reescrevia o passado todo: ela passava a dever a sua parte de
-- jantares de janeiro em que não esteve, e o saldo de quem lá estava invertia-se
-- sem que ninguém tivesse mexido numa despesa. Pior com acertos pelo meio: um
-- acerto é um valor fixo, por isso uma redivisão depois de ele ser pago deixa um
-- resíduo permanente que não corresponde a dívida nenhuma.
--
-- A DECISÃO (do Tiago). Quando se acrescenta alguém, pergunta-se o que fazer ao
-- histórico: dividir tudo, dividir a partir de uma data, ou só de agora em
-- diante. Fica guardado por membro e é o saldo que o respeita.
alter table members
  add column if not exists participates_from date;

comment on column members.participates_from is
  'A partir de que data esta pessoa divide despesas em partes iguais. NULL = desde sempre, que é o comportamento de quem já cá estava. Não afeta divisões com pesos explícitos (percentagens, quotas, montantes fixos): essas já nomeiam quem paga o quê.';

-- Quem já existe fica a NULL, ou seja "desde sempre". É de propósito: é
-- exatamente o que a app fazia até aqui, por isso nenhum saldo já mostrado
-- muda com esta migração. O que muda é o que acontece da próxima vez que
-- alguém for acrescentado.
