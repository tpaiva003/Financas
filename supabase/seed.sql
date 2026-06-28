-- =============================================================================
-- Seed de dados de referência (idempotente). Aplica depois de 0001_init.sql.
-- Atualiza os emails dos app_users para os reais (têm de bater com ALLOWED_EMAILS).
-- =============================================================================

insert into app_users (id, email, name, sso_provider) values
  ('tiago', 'tiago@example.com', 'Tiago', 'google'),
  ('clara', 'clara@example.com', 'Clara', 'microsoft')
on conflict (id) do update set email = excluded.email, name = excluded.name;

insert into categories (id, name, color, icon) values
  ('supermercado', 'Supermercado', '#16a34a', '🛒'),
  ('restauracao',  'Restauração',  '#ea580c', '🍽️'),
  ('combustivel',  'Combustível',  '#dc2626', '⛽'),
  ('casa',         'Casa',         '#2563eb', '🏠'),
  ('saude',        'Saúde',        '#0891b2', '💊'),
  ('lazer',        'Lazer',        '#7c3aed', '🎬'),
  ('subscricoes',  'Subscrições',  '#db2777', '📺'),
  ('transportes',  'Transportes',  '#0d9488', '🚆'),
  ('outros',       'Outros',       '#64748b', '📦')
on conflict (id) do update set name = excluded.name, color = excluded.color, icon = excluded.icon;

insert into classification_rules (keyword, category_id, kind, priority, enabled) values
  ('continente', 'supermercado', 'shared',   10, true),
  ('pingo doce', 'supermercado', 'shared',   10, true),
  ('lidl',       'supermercado', 'shared',   10, true),
  ('galp',       'combustivel',  'shared',   20, true),
  ('edp',        'casa',         'shared',   20, true),
  ('spotify',    'subscricoes',  'personal',  5, true),
  ('netflix',    'subscricoes',  'shared',    5, true),
  ('comboios',   'transportes',  'shared',   30, true)
on conflict do nothing;
