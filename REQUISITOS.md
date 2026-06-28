# Requisitos — App de Despesas Partilhadas (Tiago & Clara)

> Documento de requisitos para desenvolvimento com Claude Code.
> Versão 1.0 — base para o MVP e roadmap subsequente.

---

## 1. Visão geral

Aplicação web privada para o Tiago e a Clara registarem e dividirem as despesas do agregado familiar. **Substitui o Tricount/Splitwise**: passa a ser o sistema de registo e de saldos (quem deve a quem). Funciona em desktop e em telemóvel (Tiago em Android, Clara em Apple), com a mesma experiência sincronizada.

Duas formas de meter despesas:
1. **Upload de documentos** — o utilizador carrega os exports dos bancos/serviços e a app extrai as transações automaticamente (reaproveitando os parsers Python já existentes).
2. **Entrada manual** — formulário rápido para quem prefere escrever.

Cada despesa é classificada como **partilhada** ou **pessoal**, e as partilhadas entram no cálculo do saldo entre os dois.

### Objetivos
- Reduzir a tarefa "registar uma despesa" a poucos segundos no telemóvel.
- Eliminar a entrada manual repetida via import de ficheiros.
- Ter sempre um saldo claro e fiável de quem deve a quem.
- Lidar bem com despesas recorrentes (incluindo as de valor variável).
- Cobrir as falhas habituais das apps deste género (ver Secção 7).

### Princípios
- **Privacidade primeiro:** dados acessíveis só aos dois, atrás de autenticação estrita. Encriptação em repouso. Sem indexação pública.
- **Rápido na tarefa comum:** adicionar uma despesa partilhada tem de ser a ação mais rápida da app.
- **Confiável nos números:** zero duplicados, saldo sempre reconciliável, histórico auditável.
- **Sem aprisionamento:** os dados são exportáveis na íntegra a qualquer momento.

---

## 2. Utilizadores e acesso

### Modelo
- Exatamente **dois utilizadores**: Tiago e Clara. Sem registo aberto.
- **Lista branca de emails** (allow-list) — só os dois emails autorizados conseguem autenticar-se. Qualquer outro login é rejeitado, mesmo com SSO válido.

### Autenticação (REQ-AUTH)
- **REQ-AUTH-1** — Login via SSO. Tiago: Google. Clara: Google **ou** Microsoft (suportar ambos os fornecedores).
- **REQ-AUTH-2** — Após autenticação no fornecedor, validar o email contra a allow-list. Email fora da lista → acesso negado, sem criar conta.
- **REQ-AUTH-3** — Sessões persistentes (não obrigar a login a cada visita), com logout manual e expiração configurável.
- **REQ-AUTH-4** — Sem páginas públicas que exponham dados. Tudo o que não seja a landing de login exige sessão válida.

### Papéis
- Ambos os utilizadores são iguais em permissões (podem criar, editar e apagar despesas, registar acertos, gerir recorrentes).
- Toda a alteração fica registada com autor e data (ver Secção 7, auditoria).

### Privacidade entre os dois (decisão de produto a confirmar)
- **REQ-PRIV-1** — As despesas **partilhadas** são visíveis a ambos com todo o detalhe.
- **REQ-PRIV-2** — Despesas **pessoais**: cada um só vê o detalhe das suas (o outro nem as vê). O dono de uma despesa pessoal pode **torná-la visível** ao outro, caso a caso.

---

## 3. Conceitos e modelo de dados

Entidades principais (a app deve modelá-las explicitamente):

- **Utilizador** — id, nome, email, fornecedor SSO.
- **Despesa (Expense)** — id; UID estável (dedup); descrição; valor; moeda; data da transação; data de lançamento (opcional, p/ cartões); categoria; tags; quem pagou (payer); tipo (partilhada/pessoal); regra de divisão; origem (manual / import / recorrente); ficheiro/recibo associado (opcional); estado (confirmada / pendente); autor e timestamps de criação/edição.
- **Linha de despesa (item)** *(opcional, p/ split de uma compra)* — descrição, valor, partilhada/pessoal. Permite uma compra única com parte partilhada e parte pessoal.
- **Regra de divisão (Split)** — tipo (50/50, percentagem, valor fixo, por quotas) e parâmetros.
- **Acerto (Settlement)** — pagamento de um ao outro para zerar/reduzir saldo: de quem, para quem, valor, data, nota.
- **Despesa recorrente (Recurring template)** — descrição; valor (fixo ou variável); frequência; próxima data; regra de divisão; categoria; ativo/pausado; data de fim opcional.
- **Categoria** — nome, ícone/cor, personalizável.
- **Regra de classificação** — palavra-chave → categoria e/ou partilhada/pessoal (reaproveitar as regras YAML existentes).
- **Importação (Import batch)** — ficheiro de origem, fonte (Universo, Wizink, etc.), data, nº de transações, nº de duplicados detetados, estado.
- **Registo de auditoria (Audit log)** — entidade afetada, ação, autor, antes/depois, timestamp.

> O UID estável de dedup e a lógica de normalização já existem no projeto Python — devem ser a fonte de verdade para evitar duplicados.

---

## 4. Funcionalidades core (MVP)

### 4.1 Entrada manual de despesas (REQ-MAN)
- **REQ-MAN-1** — Formulário rápido com: valor, descrição, data (default: hoje), categoria, quem pagou, partilhada/pessoal, regra de divisão (default: 50/50 quando partilhada).
- **REQ-MAN-2** — Atalho de "adicionar despesa" sempre a um toque no mobile (botão flutuante / ação primária).
- **REQ-MAN-3** — Categoria e divisão sugeridas automaticamente a partir da descrição (regras de classificação), editáveis.
- **REQ-MAN-4** — Anexar recibo (foto/PDF) opcional.
- **REQ-MAN-5** — Guardar e adicionar outra sem sair do fluxo (entrada em série).

### 4.2 Import por upload de documentos (REQ-IMP)
- **REQ-IMP-1** — Upload de ficheiros das fontes suportadas, com deteção/seleção da fonte:
  - Excel: **Activo Bank**, **Bankinter (conta)** — *Tier 1, mais simples, começar por aqui.*
  - PDF com texto: **Universo**, **Wizink**, **Bankinter (cartão de crédito)** — *Tier 2.*
  - Texto: **Edenred** — *Tier 2; tem limite de 60 transações por export.*
- **REQ-IMP-2** — A app corre o parser correspondente, normaliza as transações e mostra uma **pré-visualização** antes de gravar (nada entra sem confirmação).
- **REQ-IMP-3** — Na pré-visualização: classificação automática partilhada/pessoal e categoria por transação, com edição em massa (selecionar várias e recategorizar/mudar divisão de uma vez).
- **REQ-IMP-4** — **Deteção de duplicados** via UID estável: transações já existentes aparecem marcadas e são ignoradas por defeito.
- **REQ-IMP-5** — **Reconciliação manual ↔ banco:** se uma despesa foi metida à mão e depois aparece no extrato, a app sugere o casamento das duas em vez de duplicar.
- **REQ-IMP-6** — **Lembrete específico do Edenred:** dado o limite de 60 transações por export, notificar/lembrar de exportar com frequência suficiente para não perder dados.
- **REQ-IMP-7** — Cada importação fica registada (ficheiro, fonte, nº transações, duplicados) e é reversível (poder anular um lote importado).

### 4.3 Classificação partilhada vs pessoal (REQ-CLF)
- **REQ-CLF-1** — Motor de regras por palavra-chave (reaproveitar as regras YAML existentes), editável na própria app.
- **REQ-CLF-2** — Classificação automática no import e na entrada manual, sempre **sobreponível** manualmente.
- **REQ-CLF-3** — Entradas manuais nunca são reclassificadas automaticamente por trás (preserva a escolha do utilizador — bug já identificado no pipeline).
- **REQ-CLF-4** — Editor visual de regras: ver que regras existem, testar uma regra contra o histórico, adicionar/remover.

### 4.4 Divisão flexível (REQ-SPL)
- **REQ-SPL-1** — Separar sempre **quem pagou** de **como se divide**.
- **REQ-SPL-2** — Tipos de divisão: 50/50; percentagem (ex.: 70/30); valor fixo por pessoa; por quotas/shares. **Default 50/50**, ajustável em cada despesa.
- **REQ-SPL-3** — Divisão ao nível do item: uma compra única pode ter linhas partilhadas e linhas pessoais (ex.: supermercado com um artigo só de um dos dois).
- **REQ-SPL-4** — Suporte a reembolsos/estornos/cashback (valores negativos) sem partir o saldo.
- **REQ-SPL-5** — **Sugestão inteligente de divisão:** a app regista as despesas (por categoria/descrição) que fogem ao 50/50 e, com histórico suficiente, propõe uma alocação diferente para casos semelhantes. A sugestão é sempre opcional e o utilizador pode fazer override.

### 4.5 Saldos e acertos (REQ-BAL)
- **REQ-BAL-1** — Saldo atual sempre visível: "quem deve a quem e quanto", calculado a partir das despesas partilhadas.
- **REQ-BAL-2** — Registar um **acerto** (um paga ao outro), com data e nota, que reduz/zera o saldo.
- **REQ-BAL-3** — Histórico de acertos e evolução do saldo ao longo do tempo.
- **REQ-BAL-4** — Capacidade de explicar o saldo: clicar no valor e ver as despesas que o compõem (transparência total — evita o "porque é que devo isto?").

### 4.6 Despesas recorrentes (REQ-REC)
- **REQ-REC-1** — Criar template recorrente com: descrição, categoria, divisão, frequência (semanal, mensal, anual, intervalo personalizado), próxima data e data de fim opcional.
- **REQ-REC-2** — Suportar **valor fixo** (renda) e **valor variável** (luz, água, gás): para variáveis, na data prevista a app cria a despesa em estado **pendente** e pede confirmação do valor real antes de entrar no saldo.
- **REQ-REC-3** — Geração automática na data certa, com notificação.
- **REQ-REC-4** — Pausar, retomar, saltar uma ocorrência e terminar uma recorrência facilmente.
- **REQ-REC-5** — Vista dedicada de "próximas recorrentes" e quais estão por confirmar.

---

## 5. UX / Interface

### 5.1 Multi-dispositivo
- **REQ-UX-1** — App **responsiva** e instalável como **PWA** (adicionar ao ecrã inicial em Android e iOS, comportando-se como app nativa). Evita publicar em duas lojas.
- **REQ-UX-2** — Desktop otimizado para consulta, tabelas, filtros e relatórios; mobile otimizado para entrada rápida e consulta de saldo.
- **REQ-UX-3** — Experiência e dados idênticos nas duas plataformas (Android e Apple).

### 5.2 Consulta e navegação
- **REQ-UX-4** — Lista de despesas com **filtros e pesquisa**: por data/intervalo, categoria, pessoa, partilhada/pessoal, valor, texto, fonte/origem.
- **REQ-UX-5** — **Edição em massa**: selecionar várias despesas e recategorizar, mudar divisão ou apagar de uma vez.
- **REQ-UX-6** — Vista de saldo destacada e sempre acessível.
- **REQ-UX-7** — Estados vazios e de erro claros (ex.: ficheiro de import não reconhecido, formato inesperado).

### 5.3 Relatórios e insights
- **REQ-UX-8** — Gráficos: gasto por categoria, por mês, tendência, e split por pessoa (quanto cada um gastou / adiantou).
- **REQ-UX-9** — Filtrar relatórios por período.
- **REQ-UX-10** — Exportar para CSV/Excel (despesas e relatórios).

---

## 6. Requisitos não-funcionais

### 6.1 Segurança e privacidade (REQ-SEC)
- **REQ-SEC-1** — Acesso só via SSO + allow-list de 2 emails.
- **REQ-SEC-2** — Encriptação em trânsito (HTTPS) e em repouso.
- **REQ-SEC-3** — Isolamento de dados por regras de acesso (ex.: row-level security) — em particular para as despesas pessoais.
- **REQ-SEC-4** — Recibos/ficheiros carregados guardados em armazenamento privado, não acessíveis por URL público.
- **REQ-SEC-5** — Sem telemetria que envie dados financeiros para terceiros.

### 6.2 Fiabilidade e dados
- **REQ-DAT-1** — Deduplicação garantida por UID estável; nunca criar a mesma transação duas vezes.
- **REQ-DAT-2** — **Backup/exportação total** dos dados a pedido (portabilidade — não ficar refém da ferramenta).
- **REQ-DAT-3** — **Registo de auditoria**: toda a criação/edição/eliminação fica logada com autor, antes/depois e timestamp.
- **REQ-DAT-4** — Soft-delete (lixo recuperável) em vez de eliminação imediata, com possibilidade de restaurar.

### 6.3 Sincronização e offline
- **REQ-SYNC-1** — Sincronização entre dispositivos quase em tempo real (os dois veem o mesmo estado).
- **REQ-SYNC-2** — **Modo offline no mobile**: permitir adicionar despesas sem rede e sincronizar quando voltar a ligação (fila offline).
- **REQ-SYNC-3** — **Bloqueio pessimista:** enquanto um utilizador edita uma despesa, o registo fica bloqueado para o outro, que vê um aviso de que está a ser editado. Liberta ao guardar/cancelar ou por timeout.

### 6.4 Notificações (REQ-NOT)
- **REQ-NOT-1** — Lembrete para confirmar recorrentes de valor variável pendentes.
- **REQ-NOT-2** — Lembrete para acertar o saldo, **configurável pelo utilizador** (mensal, por limiar de valor, ou desligado). **Default: mensal.**
- **REQ-NOT-3** — Lembrete para exportar o Edenred a tempo (limite de 60 transações).
- **REQ-NOT-4** — Canais: notificação na app/PWA e/ou email. Configuráveis.

---

## 7. Falhas comuns deste tipo de app que esta deve resolver

Estas são as fraquezas típicas do Splitwise/Tricount e afins. Estão refletidas nos requisitos acima; ficam aqui em conjunto como checklist de diferenciação:

1. **Divisão rígida (só 50/50)** → divisão por %, valor fixo e quotas (REQ-SPL-2).
2. **Recorrentes básicas que não lidam com valor variável** → templates com valor variável e confirmação (REQ-REC-2).
3. **Sem deteção de duplicados** → dedup por UID estável (REQ-IMP-4, REQ-DAT-1).
4. **Sem reconciliação manual ↔ extrato** → casamento sugerido (REQ-IMP-5).
5. **Não dividir uma compra mista** (parte partilhada, parte pessoal) → split ao nível do item (REQ-SPL-3).
6. **Confundir quem pagou com como se divide** → separação explícita (REQ-SPL-1).
7. **Categorias fixas e não personalizáveis** → categorias e regras editáveis (REQ-CLF, Secção 3).
8. **Histórico sem auditoria** → audit log com autor e antes/depois (REQ-DAT-3).
9. **Acertos mal registados / saldo opaco** → acertos com histórico e saldo explicável até à despesa (REQ-BAL).
10. **Sem offline / lento a adicionar** → PWA com fila offline e entrada num toque (REQ-SYNC-2, REQ-MAN-2).
11. **Sem edição em massa** → bulk edit no import e na lista (REQ-IMP-3, REQ-UX-5).
12. **Sem anexar recibos** → recibos por despesa (REQ-MAN-4).
13. **Relatórios fracos** → gráficos e exportação (REQ-UX-8 a 10).
14. **Datas confusas em cartões** (transação vs lançamento) → ambos os campos no modelo (Secção 3).
15. **Reembolsos/estornos mal tratados** → valores negativos suportados (REQ-SPL-4).
16. **Aprisionamento dos dados** → exportação total (REQ-DAT-2).
17. **Pesquisa/filtros pobres** → filtros completos (REQ-UX-4).
18. **Sem lembretes úteis** → notificações de recorrentes, acertos e Edenred (REQ-NOT).

---

## 8. Fontes e contexto específico (referência para o import)

| Fonte | Formato | Tier | Notas |
|---|---|---|---|
| Activo Bank | Excel | 1 | Mais simples — começar por aqui |
| Bankinter (conta) | Excel | 1 | Mais simples — começar por aqui |
| Universo | PDF (com texto) | 2 | |
| Wizink | PDF (com texto) | 2 | Cartão — atenção a datas transação/lançamento |
| Bankinter (cartão) | PDF (com texto) | 2 | Cartão — atenção a datas transação/lançamento |
| Edenred | Texto | 2 | **Limite de 60 transações por export** |

> Decisão prévia do projeto: scraping dos sites bancários foi **descartado** (PSD2/SCA, termos de serviço e fragilidade de manutenção). A arquitetura correta é o import de ficheiros exportados — mantida neste produto.

---

## 9. Stack sugerida (orientação para o Claude Code)

Sugestão que encaixa nos requisitos (multi-dispositivo, SSO, offline, sync, privacidade) e que o Claude Code implementa bem. Substituível, mas é um bom ponto de partida:

- **Frontend:** Next.js (React) + Tailwind, configurado como **PWA** (instalável em Android e iOS), responsivo.
- **Autenticação:** Auth.js / NextAuth com fornecedores **Google** e **Microsoft (Entra/Azure AD)**, com **allow-list** de emails.
- **Backend + dados:** **Supabase** (Postgres + Auth + Storage + Realtime). Encaixa em quase tudo: autenticação SSO, base de dados, armazenamento privado de recibos, *row-level security* para a privacidade pessoal, e sincronização em tempo real.
- **Alojamento:** Vercel (frontend) + Supabase (dados). App online mas fechada à allow-list.
- **Parsing dos documentos:** reaproveitar a lógica Python existente (schema normalizado, UIDs de dedup, parsers). Expor como serviço/endpoint de import que recebe o ficheiro, corre o parser certo e devolve transações normalizadas para a pré-visualização.

> Nota de privacidade sobre alojamento: esta opção mantém os dados num fornecedor cloud (Supabase), encriptados e fechados aos dois emails. Se em algum momento quiserem *zero cloud*, a alternativa é self-hosting — mas isso complica o acesso a partir do Android e do Apple fora de casa. Para o equilíbrio privacidade/conveniência pretendido, a web privada com allow-list é a recomendação.

---

## 10. Âmbito do MVP vs. roadmap

**MVP (primeira versão funcional):**
- Autenticação SSO + allow-list (Secção 2).
- Entrada manual rápida (4.1).
- Import por upload — começar pelos Excel Tier 1 (Activo Bank, Bankinter conta) com pré-visualização e dedup (4.2).
- Classificação partilhada/pessoal com regras editáveis (4.3).
- Divisão 50/50 e por % (4.4, subconjunto).
- Saldo e acertos (4.5).
- Lista com filtros e pesquisa (5.2).
- PWA responsiva (5.1).

**Fase 2:**
- Restantes parsers Tier 2 (Universo, Wizink, Bankinter cartão, Edenred).
- Recorrentes com valor variável (4.6).
- Split ao nível do item (REQ-SPL-3).
- Offline + fila de sincronização (REQ-SYNC-2).
- Relatórios e gráficos (5.3).
- Notificações (REQ-NOT).
- Reconciliação manual ↔ extrato (REQ-IMP-5).

**Fase 3 / nice-to-have:**
- Edição em massa avançada.
- Multi-moeda com taxa (viagens).
- Auditoria com vista de histórico navegável.
- Importação agendada/automática (em vez de upload manual).
- Sugestão inteligente de divisão a partir do histórico (REQ-SPL-5).
- Landing page pública + captação de interessados / waitlist (REQ-LAND).

---

## 11. Critérios de aceitação (alto nível)

- Só os dois emails autorizados entram; qualquer outro é recusado.
- Adicionar uma despesa partilhada no telemóvel demora poucos segundos.
- Importar o mesmo ficheiro duas vezes **não** cria duplicados.
- O saldo é sempre explicável até às despesas que o compõem.
- Uma despesa manual nunca é reclassificada automaticamente por trás.
- Nenhum dado financeiro está acessível sem sessão válida.
- É possível exportar todos os dados a qualquer momento.

---

## 12. Decisões tomadas

- **Privacidade das despesas pessoais:** cada um só vê as suas; o dono pode tornar uma visível ao outro (REQ-PRIV-2).
- **Divisão por defeito:** 50/50, ajustável por despesa, com sugestão inteligente ao longo do tempo (REQ-SPL-2, REQ-SPL-5).
- **Acertos:** lembrete configurável pelo utilizador, mensal por defeito (REQ-NOT-2).
- **Login da Clara:** código suporta Google e Microsoft; escolha final a confirmar com a Clara (REQ-AUTH-1).
- **Edição simultânea:** bloqueio pessimista enquanto o outro edita (REQ-SYNC-3).

---

## 13. Landing page e captação de interessados (fase posterior)

No futuro, outras pessoas podem querer usar a app. É preciso uma forma de captar quem demonstra interesse. **Não é crítico ser perfeita já** — basta ser funcional e segura.

- **REQ-LAND-1** — Página pública que apresenta a app e o problema que resolve. É a **única** parte pública do produto, totalmente **isolada** da app autenticada: não dá acesso a nenhum dado nem à aplicação em si.
- **REQ-LAND-2** — Formulário de captação de interessados (waitlist): email (obrigatório) e nome (opcional). Guardar numa tabela própria no Supabase, separada dos dados das despesas.
- **REQ-LAND-3** — **Consentimento RGPD:** checkbox de consentimento explícito + link para uma política de privacidade simples. Só guardar o contacto com consentimento dado.
- **REQ-LAND-4** — Validação de email, prevenção de duplicados, anti-spam básico (ex.: honeypot e/ou rate-limit) e mensagem de confirmação após submissão.
- **REQ-LAND-5** — Lista de interessados consultável e **exportável (CSV)**, acessível apenas aos dois administradores (Tiago e Clara).
- **REQ-LAND-6** — Nunca expor dados financeiros nem a app a partir da landing. SEO básico é opcional.

> Prioridade: posterior ao MVP da app. A landing pode evoluir/polir-se mais tarde sem afetar o núcleo do produto.
