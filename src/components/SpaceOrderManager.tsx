"use client";

import { moveSpaceAction } from "@/app/(app)/actions";

/**
 * Ordem dos ambientes. Setas em vez de arrastar: funciona bem no telemóvel e
 * é acessível por teclado.
 */
export function SpaceOrderManager({
  spaces,
  currentId,
}: {
  spaces: { id: string; name: string }[];
  currentId: string;
}) {
  if (spaces.length < 2) return null;

  return (
    <ul className="divide-y divide-hair2 rounded-xl border border-hair">
      {spaces.map((s, i) => (
        <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
          <span className={`truncate text-sm ${s.id === currentId ? "text-fg" : "text-fg-muted"}`}>
            {s.name}
            {s.id === currentId ? (
              <span className="ml-2 chip border-hair text-fg-faint">atual</span>
            ) : null}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <MoveButton spaceId={s.id} dir="up" disabled={i === 0} label="Subir" glyph="↑" />
            <MoveButton
              spaceId={s.id}
              dir="down"
              disabled={i === spaces.length - 1}
              label="Descer"
              glyph="↓"
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

function MoveButton({
  spaceId,
  dir,
  disabled,
  label,
  glyph,
}: {
  spaceId: string;
  dir: "up" | "down";
  disabled: boolean;
  label: string;
  glyph: string;
}) {
  return (
    <form action={moveSpaceAction}>
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="dir" value={dir} />
      <button
        type="submit"
        disabled={disabled}
        aria-label={`${label} ${spaceId}`}
        title={label}
        className="btn-ghost px-2 text-xs disabled:opacity-30"
      >
        {glyph}
      </button>
    </form>
  );
}
