-- 005: dados de referência que o código espera encontrar em qualquer ambiente.
-- (Conteúdo editorial, como bairros e lugares, fica em db/seeds.)

INSERT INTO idiomas (codigo, nome) VALUES
  ('pt', 'Português'),
  ('en', 'English'),
  ('de', 'Deutsch'),
  ('fr', 'Français');

-- O front traduz pelo slug (i18n) e escolhe o ícone pelo campo "icone"
INSERT INTO categorias (slug, nome, icone, ordem) VALUES
  ('pontos-turisticos', 'Pontos turísticos', 'monumento', 1),
  ('restaurantes',      'Restaurantes',      'talheres',  2),
  ('bares-e-botecos',   'Bares e botecos',   'copo',      3),
  ('padarias-e-cafes',  'Padarias e cafés',  'cafe',      4),
  ('sorveterias',       'Sorveterias',       'sorvete',   5),
  ('baladas',           'Baladas',           'musica',    6),
  ('feiras-e-pracas',   'Feiras e praças',   'feira',     7);

INSERT INTO tags (slug, nome) VALUES
  ('gratuito',         'Gratuito'),
  ('vegano',           'Opções veganas'),
  ('pet-friendly',     'Pet friendly'),
  ('lgbtqia-friendly', 'LGBTQIA+ friendly'),
  ('aberto-ate-tarde', 'Aberto até tarde'),
  ('acessivel',        'Acessível'),
  ('ao-ar-livre',      'Ao ar livre');
