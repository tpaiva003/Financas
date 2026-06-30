"use client";

import { useId, useState } from "react";

interface Cat {
  id: string;
  name: string;
  icon?: string;
}

/**
 * Campo de categoria pesquisável: o utilizador começa a escrever e o browser
 * sugere/filtra (datalist nativo). O id da categoria correspondente vai num
 * input escondido; texto sem correspondência = sem categoria.
 */
export function CategoryCombobox({
  categories,
  name = "categoryId",
  initialId = "",
  inputId = "categoryId",
}: {
  categories: Cat[];
  name?: string;
  initialId?: string;
  inputId?: string;
}) {
  const listId = useId();
  const initial = categories.find((c) => c.id === initialId);
  const [text, setText] = useState(initial?.name ?? "");

  const match = categories.find(
    (c) => c.name.trim().toLowerCase() === text.trim().toLowerCase(),
  );

  return (
    <>
      <input
        id={inputId}
        list={listId}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Sem categoria — escreve para procurar"
        autoComplete="off"
        className="input"
      />
      <datalist id={listId}>
        {categories.map((c) => (
          <option key={c.id} value={c.name}>
            {c.icon ?? ""}
          </option>
        ))}
      </datalist>
      <input type="hidden" name={name} value={match?.id ?? ""} />
    </>
  );
}
