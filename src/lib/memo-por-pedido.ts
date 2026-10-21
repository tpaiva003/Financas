/**
 * O `cache()` do React quando ele existe, e identidade quando não existe.
 *
 * No Next (Server Components e actions) o `react` resolve para o build de
 * servidor, que traz o `cache()` — memoização POR PEDIDO, que morre com ele.
 * No vitest e em scripts o `react` é o build de cliente, sem `cache`, e aí
 * não há pedido para memoizar: chamar a função diretamente é o comportamento
 * certo, não um degradado.
 */
import * as React from "react";

type Memo = <A extends unknown[], R>(fn: (...args: A) => R) => (...args: A) => R;

export const memoPorPedido: Memo =
  (React as unknown as { cache?: Memo }).cache ?? ((fn) => fn);
