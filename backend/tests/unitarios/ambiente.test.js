import { carregarAmbiente } from '../../src/config/ambiente.js';

const base = { DATABASE_URL: 'postgres://x@localhost/db', JWT_SECRET: 'a'.repeat(32) };

test('recusa subir com JWT_SECRET fraco, sem mostrar o valor', () => {
  expect(() => carregarAmbiente({ ...base, JWT_SECRET: 'curto-e-secreto' })).toThrow(/JWT_SECRET/);
  expect(() => carregarAmbiente({ ...base, JWT_SECRET: 'curto-e-secreto' })).not.toThrow(/curto-e-secreto/);
});

test('recusa subir sem DATABASE_URL', () => {
  expect(() => carregarAmbiente({ JWT_SECRET: base.JWT_SECRET })).toThrow(/DATABASE_URL/);
});

test('cookie Secure é ligado por padrão em produção e desligado em desenvolvimento', () => {
  expect(carregarAmbiente({ ...base, NODE_ENV: 'production' }).COOKIE_SECURE).toBe(true);
  expect(carregarAmbiente({ ...base, NODE_ENV: 'development' }).COOKIE_SECURE).toBe(false);
  expect(carregarAmbiente({ ...base, NODE_ENV: 'development', COOKIE_SECURE: 'true' }).COOKIE_SECURE).toBe(true);
});

test('CORS_ORIGENS vira lista', () => {
  const ambiente = carregarAmbiente({ ...base, CORS_ORIGENS: 'https://a.com, https://b.com' });
  expect(ambiente.CORS_ORIGENS).toEqual(['https://a.com', 'https://b.com']);
});
