import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/email/send";

/**
 * O sitemap, gerado pelo Next em /sitemap.xml.
 *
 * Só o que é para ser ENCONTRADO: a landing e as páginas legais. O /login e o
 * /recuperar são públicos mas são portas de serviço — quem lá precisa de ir já
 * cá está, e um resultado de pesquisa a apontar para um formulário de login
 * não ajuda ninguém a perceber o que a app é.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/privacidade`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/termos`, changeFrequency: "monthly", priority: 0.3 },
  ];
}
