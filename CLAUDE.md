# Projeto: App de Despesas Partilhadas (Tiago & Clara)

App web privada que substitui o Tricount/Splitwise: regista despesas (por upload de documentos e manualmente), divide-as e mantém o saldo entre dois utilizadores. Só dois utilizadores, atrás de autenticação estrita.

## Documentos
- `REQUISITOS.md` — especificação completa (o **quê**). Lê-o primeiro e segue-o.
- `DECISOES.md` — regista aqui as decisões que tomares autonomamente (cria o ficheiro se não existir).

## Stack (fixa — não trocar sem perguntar)
- **Next.js + TypeScript + Tailwind**, configurado como **PWA** instalável (Android e iOS).
- **Auth.js (NextAuth)** com fornecedores **Google** e **Microsoft** + **allow-list** de 2 emails.
- **Supabase**: Postgres, Auth, Storage (recibos), Realtime e **RLS** (row-level security).
- **Deploy**: Vercel (frontend) + Supabase (dados).
- **Parsing dos ficheiros**: reutilizar a lógica Python existente (schema normalizado, UIDs de dedup). Não reescrever do zero.

## Como trabalhar (autonomia)
- Trabalha **por fases** (ver `REQUISITOS.md` §10). Completa cada fase por inteiro — código + testes + app a correr — antes de avançar para a seguinte.
- **IMPORTANT:** no fim de cada fase a app TEM de compilar e arrancar sem erros. Corre o build e os testes e corrige até passarem antes de continuar.
- Escreve e corre **testes** para a lógica crítica: deduplicação, cálculo de saldo, regras de divisão e classificação.
- **Decide sozinho** as escolhas de baixo risco (nomes, estrutura de pastas, bibliotecas auxiliares, detalhes de UI). Não pares para perguntar isto — avança e regista o que for relevante em `DECISOES.md`.
- **YOU MUST parar e perguntar** apenas quando: (a) precisas de credenciais/segredos reais (client IDs de SSO, chaves Supabase); (b) uma ação é destrutiva ou irreversível; (c) uma ambiguidade altera o **modelo de dados** de forma significativa.
- **Segredos:** nunca inventes chaves reais. Usa variáveis de ambiente e mantém um `.env.example` com placeholders e instruções.

## Barra de qualidade ("perto do final")
- Responsivo e verificado em **mobile (Android/iOS) e desktop**.
- Sem ecrãs partidos: trata estados de carregamento, vazio e erro.
- Acessibilidade básica: labels, contraste, navegação por teclado.
- Adicionar uma despesa partilhada no telemóvel = poucos toques.
- Privacidade: nada acessível sem sessão; só os 2 emails autorizados entram; RLS ativa.

## Entregáveis no fim de cada fase
- App a correr localmente, com `README.md` (instalar e arrancar).
- `.env.example` completo.
- Script de **seed** com 2 utilizadores demo e dados de exemplo, para a app ser navegável de ponta a ponta.
- Testes a passar.
- `DECISOES.md` atualizado.

## Invariantes do domínio (YOU MUST — nunca violar)
- **Deduplicação por UID estável:** a mesma transação nunca entra duas vezes.
- **Entradas manuais nunca são reclassificadas automaticamente** por trás (preserva a escolha do utilizador).
- **"Quem pagou" é independente de "como se divide".**
- O **saldo tem de ser sempre explicável** até às despesas que o compõem.
- A **landing page** (quando existir) é a única parte pública e nunca expõe dados nem a app.
