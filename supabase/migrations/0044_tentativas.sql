-- Tentativas contadas, para os formulários públicos terem um tecto.
--
-- O login, a recuperação de palavra-chave, a fila de espera e a caixa de
-- contacto aceitavam pedidos sem limite nenhum. Para o login isso é deixar
-- tentar palavras-chave à velocidade da rede; para a recuperação é deixar
-- encher a caixa de email de alguém; para os formulários é spam barato.
--
-- Uma tabela e uma função, e não um contador em memória, porque a app corre
-- em funções serverless: cada pedido pode aterrar numa instância diferente, e
-- um contador em memória contaria sempre "primeira tentativa".
--
-- A função é UMA instrução com o incremento e a decisão lá dentro, para dois
-- pedidos simultâneos não lerem ambos "ainda cabe" — o upsert serializa no
-- lock da linha.
create table if not exists tentativas (
  -- "escopo:identificador", p.ex. "login:mail@exemplo.pt". O identificador
  -- normaliza-se no código; aqui é opaco.
  chave text primary key,
  inicio_da_janela timestamptz not null,
  contagem integer not null
);

alter table tentativas enable row level security;

-- Como todas as outras: só o service role toca nisto. (A política
-- is_app_user() existe nas tabelas que a app lê com sessão; esta é interna.)

comment on table tentativas is
  'Janela fixa de tentativas por chave, para rate limiting dos formulários públicos. Linhas velhas são reaproveitadas pela própria função.';

-- Regista uma tentativa e diz se ainda cabe na janela.
--
-- Janela FIXA e não deslizante, de propósito: é mais fácil de explicar
-- ("10 tentativas por quarto de hora") e o pior caso — 2x o tecto a cavalo de
-- duas janelas — não muda nada para os tectos folgados que se usam.
create or replace function registar_tentativa(
  p_chave text,
  p_janela_ms bigint,
  p_tecto integer
) returns boolean
language plpgsql
security definer
as $$
declare
  v_agora timestamptz := now();
  v_contagem integer;
begin
  insert into tentativas (chave, inicio_da_janela, contagem)
  values (p_chave, v_agora, 1)
  on conflict (chave) do update set
    -- Janela expirada: recomeça. Dentro da janela: incrementa.
    contagem = case
      when tentativas.inicio_da_janela < v_agora - make_interval(secs => p_janela_ms / 1000.0)
        then 1
      else tentativas.contagem + 1
    end,
    inicio_da_janela = case
      when tentativas.inicio_da_janela < v_agora - make_interval(secs => p_janela_ms / 1000.0)
        then v_agora
      else tentativas.inicio_da_janela
    end
  returning contagem into v_contagem;

  return v_contagem <= p_tecto;
end;
$$;
