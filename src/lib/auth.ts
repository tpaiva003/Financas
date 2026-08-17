/**
 * Autenticação completa (runtime Node), usada pelo route handler e pelo servidor.
 *
 * Como se entra HOJE:
 *  - **Palavra-chave.** É o único caminho que a interface oferece. Uma conta
 *    sem palavra-chave definida não entra por aqui: a primeira palavra-chave
 *    escolhe-se pela ligação do convite (mesmo caminho da reposição), que é o
 *    que prova que quem a define é quem recebe o email. A "primeira entrada
 *    define a palavra-chave" foi removida — deixava a conta ao alcance de quem
 *    soubesse o email primeiro.
 *  - **Google e Microsoft** estão configurados no `auth.config.ts` mas **não têm
 *    botão em lado nenhum**. Não é só falta de credenciais: falta a UI.
 *  - O "Modo de desenvolvimento" já não existe. A `AUTH_DEV_LOGIN` foi removida
 *    porque a função que a lia não tinha chamadores — defini-la não fazia nada,
 *    e uma variável que promete um comportamento que não acontece é pior do que
 *    variável nenhuma.
 */

import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { randomUUID } from "node:crypto";
import { authConfig } from "./auth.config";
import { userByEmail } from "./users";
import { isEmailAllowed, isOpenRegistrationEnabled } from "./env";
import { canSignIn, decideSignup } from "./domain";
import { hashPassword, verifyPassword, passwordIssue } from "./password";
import { getRepository } from "./data";

/**
 * Um hash a sério de uma palavra-chave que nunca existiu: gerada e deitada
 * fora no momento em que este valor foi criado. Não abre nada — serve para os
 * ramos "conta não existe" e "conta sem palavra-chave" pagarem o mesmo PBKDF2
 * que uma conta real, senão o tempo de resposta era um oráculo de emails.
 */
const HASH_FANTASMA =
  "pbkdf2$100000$LvDokizPn9AOYYnYSka3gA==$oZCHYCubR3Xo/grmDTHJ+Fa0XmPPOq3hbVCxCUS8hE8=";

const providers: NextAuthConfig["providers"] = [...authConfig.providers];

providers.push(
  Credentials({
    id: "password",
    name: "Palavra-chave",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Palavra-chave", type: "password" },
    },
    authorize: async (raw) => {
      const email = typeof raw?.email === "string" ? raw.email.toLowerCase() : "";
      const password = typeof raw?.password === "string" ? raw.password : "";
      if (passwordIssue(password)) return null;

      const repo = getRepository();
      // Allow-list: utilizadores base (env) OU utilizadores adicionais da BD
      // (submitters a quem o admin deu acesso). Mais ninguém entra.
      const u = userByEmail(email) ?? (await repo.getAppUserByEmail(email));
      if (!u) {
        // A mensagem já era igual; o TEMPO ainda não. Recusar sem correr o
        // PBKDF2 respondia dezenas de milissegundos mais depressa do que uma
        // palavra-chave errada numa conta real — um cronómetro chegava para
        // saber que emails existem. O hash é de uma palavra-chave deitada
        // fora ao ser gerado; o resultado ignora-se, só o tempo conta.
        await verifyPassword(password, HASH_FANTASMA);
        return null;
      }

      const existing = await repo.getUserPasswordHash(u.id);
      /**
       * **Uma conta sem palavra-chave definida não se entra: define-se.**
       *
       * Isto era "primeira entrada define a palavra-chave", e enquanto a app
       * era de duas pessoas conhecidas passava. Com contas convidadas deixa de
       * passar: entre o convite ser criado e a pessoa entrar, **quem souber o
       * email é a primeira entrada** — escreve uma palavra-chave qualquer e
       * fica com a conta e com o ambiente que foi criado para outra pessoa. Não
       * é preciso adivinhar nada; a janela é a espera de quem foi convidado.
       *
       * A primeira palavra-chave passa pelo mesmo caminho da reposição, que já
       * existe e já prova que a pessoa recebe o email daquele endereço. Aqui só
       * se recusa — e recusa-se com a mesma resposta de uma palavra-chave
       * errada, para o ecrã de entrada não dizer a estranhos quais são os
       * emails que existem.
       */
      if (!existing) {
        // O mesmo cuidado com o tempo do ramo "conta não existe", acima.
        await verifyPassword(password, HASH_FANTASMA);
        return null;
      }
      const ok = await verifyPassword(password, existing);
      return ok ? { id: u.id, email: u.email, name: u.name } : null;
    },
  }),
);

/**
 * Quem pode entrar, decidido aqui e não em `auth.config.ts`.
 *
 * A verificação precisa de consultar a base de dados (as contas criadas na app
 * não vivem em variáveis de ambiente) e o `auth.config.ts` corre no edge, onde
 * não há acesso a dados. Este ficheiro corre em Node, que é onde o início de
 * sessão acontece de facto.
 */
const signInCallback: NonNullable<NextAuthConfig["callbacks"]>["signIn"] = async ({
  user,
  account,
}) => {
  const provider = account?.provider ?? "password";
  const email = (user.email ?? "").toLowerCase();
  if (!email) return false;

  const repo = getRepository();
  const existing = userByEmail(email) ?? (await repo.getAppUserByEmail(email).catch(() => null));

  const allowed = canSignIn({
    provider,
    isEnvAllowed: isEmailAllowed(email),
    hasAccount: Boolean(existing),
    openRegistration: isOpenRegistrationEnabled(),
  });
  if (!allowed) return false;

  // Registo aberto e primeira entrada por SSO: cria-se a conta agora. O
  // ambiente próprio nasce no primeiro acesso (ver `getSpaceContext`), com a
  // pessoa sozinha lá dentro.
  if (provider !== "password" && !existing) {
    // O tecto de contas novas por dia (`decideSignup`) aplica-se AQUI, no único
    // sítio por onde uma conta nasce sozinha. Convites do admin não passam por
    // este ramo (criam a conta antes de a pessoa entrar), e é assim que o tecto
    // trava robôs sem travar convidados. Quem não cabe não leva um erro: vai
    // para a porta fechada do /login, que convida a deixar o email na fila.
    const hoje = new Date().toISOString().slice(0, 10);
    const criadasHoje = await repo.countAppUsersCreatedOn(hoje).catch(() => 0);
    if (!decideSignup(criadasHoje).allowed) {
      return "/login?cheio=1";
    }

    await repo
      .createAppUser({
        id: `usr_${randomUUID()}`,
        email,
        name: user.name?.trim() || email.split("@")[0]!,
      })
      .catch(() => {
        // Se a criação falhar, deixamos entrar na mesma: o pior que acontece é
        // a conta ser criada na visita seguinte.
      });
  }

  return true;
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers,
  callbacks: { ...authConfig.callbacks, signIn: signInCallback },
});
