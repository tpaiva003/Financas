-- 0035 O domínio da marca de um investimento, para lhe mostrar o logo.
--
-- PORQUÊ UM DOMÍNIO E NÃO UM URL DE IMAGEM. Um URL de imagem apodrece: o
-- serviço muda de caminho, a imagem sai, e fica um quadrado partido na carteira
-- de alguém. Um domínio é um facto sobre a empresa e não sobre um fornecedor —
-- com ele, trocar de fonte de logos é mudar uma linha de código.
--
-- PORQUE É QUE ISTO NÃO QUEBRA A PRIVACIDADE. A decisão registada em
-- `domain/monogram.ts` era não ir buscar logos, porque todos os serviços
-- funcionam pedindo a imagem pelo ticker — e o browser de quem usa a app diria
-- a um terceiro exatamente que ações a pessoa tem. Essa preocupação continua de
-- pé e é a razão de o logo ser servido por uma rota da própria app: o browser
-- pede ao nosso servidor, e é o servidor que vai buscar. O terceiro vê um
-- servidor, não vê uma pessoa.
--
-- O MONOGRAMA NÃO SAI. Metade dos ETF e tudo o que não é marca conhecida não
-- tem logo utilizável; sem recuo, a carteira ficava aos buracos. O logo entra
-- por cima do monograma quando existe.

alter table assets add column if not exists logo_domain text;

comment on column assets.logo_domain is
  'Domínio da marca (ex.: "apple.com", "ishares.com"). Serve para ir buscar o logo pela rota da própria app — nunca directamente do browser, que diria a um terceiro que ações a pessoa tem.';
