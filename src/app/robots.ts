import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/email/send";

/**
 * O robots.txt, gerado pelo Next em /robots.txt.
 *
 * A lista de `disallow` NÃO é a fronteira de privacidade — essa é a sessão, no
 * middleware, e um crawler anónimo bate no /login como toda a gente. Isto é só
 * poupar os motores de busca a rastejar portas fechadas, e dizer onde está o
 * sitemap. As páginas de token levam `noindex` próprio; aqui vão os prefixos.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/acertos",
          "/ajuda",
          "/ambiente",
          "/ambientes",
          "/aprovacoes",
          "/dashboard",
          "/despesas",
          "/importar",
          "/mensagens",
          "/patrimonio",
          "/plataforma",
          "/recorrentes",
          "/relatorios",
          "/rendimentos",
          "/saldo",
          "/recuperar/",
          "/convite/",
        ],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
