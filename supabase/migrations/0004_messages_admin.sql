-- 0004 — Gestão de mensagens de contacto pelo admin.
-- Arquivar mensagens lidas e guardar notas internas (o que foi feito).

alter table contact_messages
  add column if not exists archived_at timestamptz,
  add column if not exists notes       text;

-- Índice para listar rapidamente as não arquivadas por data.
create index if not exists contact_messages_archived_idx
  on contact_messages (archived_at, created_at desc);
