"use client";

import { useState } from "react";
import Link from "next/link";
import { setCurrentSpaceAction } from "@/app/(app)/actions";

interface SpaceOpt {
  id: string;
  name: string;
}

export function SpaceSwitcher({
  spaces,
  currentId,
  currentName,
}: {
  spaces: SpaceOpt[];
  currentId: string;
  currentName: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-full border border-hair px-3 py-1.5 text-sm text-fg transition hover:border-fg/30"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="max-w-[9rem] truncate">{currentName}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute left-0 z-40 mt-2 w-60 overflow-hidden rounded-xl border border-hair bg-panel shadow-glow"
          >
            <p className="eyebrow px-3 pb-1 pt-3">Ambientes</p>
            {spaces.map((s) => (
              <form action={setCurrentSpaceAction} key={s.id}>
                <input type="hidden" name="spaceId" value={s.id} />
                <button
                  type="submit"
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition hover:bg-panel2 ${
                    s.id === currentId ? "text-fg" : "text-fg-muted"
                  }`}
                >
                  <span className="truncate">{s.name}</span>
                  {s.id === currentId ? <span className="text-credit">✓</span> : null}
                </button>
              </form>
            ))}
            <div className="my-1 border-t border-hair2" />
            <Link href="/ambiente" className="block px-3 py-2 text-sm text-fg-muted hover:bg-panel2" onClick={() => setOpen(false)}>
              Gerir participantes
            </Link>
            <Link href="/ambientes/novo" className="block px-3 py-2 text-sm text-fg-muted hover:bg-panel2" onClick={() => setOpen(false)}>
              + Novo ambiente
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
