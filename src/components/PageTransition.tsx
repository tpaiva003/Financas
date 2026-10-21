"use client";

import { usePathname } from "next/navigation";

/**
 * Faz o conteúdo entrar a cada mudança de página.
 *
 * O App Router mantém o layout entre rotas e troca só os filhos, por isso uma
 * animação posta no `<main>` corre uma vez, quando a app abre, e nunca mais.
 * Era isso que dava a sensação de ecrã a trocar de repente. A `key` pelo
 * caminho obriga o React a montar um elemento novo em cada navegação, e a
 * animação volta a correr.
 *
 * A duração é curta de propósito (380ms): quem regista despesas passa por aqui
 * dezenas de vezes ao dia, e uma entrada bonita à terceira vez já é um atraso.
 * Com `prefers-reduced-motion` não corre nada (ver globals.css).
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-in">
      {children}
    </div>
  );
}
