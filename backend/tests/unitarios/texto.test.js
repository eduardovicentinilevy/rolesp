import { gerarSlug, limparTextoLivre } from '../../src/utils/texto.js';

describe('limparTextoLivre (texto de visitante vira texto puro)', () => {
  test.each([
    ['<script>alert(1)</script>Oi', 'alert(1)Oi'], // a tag some; o resto vira texto inofensivo
    ['<img src=x onerror=alert(1)>Legal', 'Legal'],
    ['&lt;script&gt;alert(1)&lt;/script&gt;ok', 'alert(1)ok'], // tag "disfarçada" em entidades
    ['<b>negrito</b> e <a href="javascript:alert(1)">link</a>', 'negrito e link'],
    ['Tom & Jerry', 'Tom & Jerry'], // & continua & (não vira &amp;)
    ['nota 5 > nota 3 < nota 4', 'nota 5 > nota 3 < nota 4'],
    ['  espaços    demais  ', 'espaços demais'],
    ['linha 1\n\n\n\n\nlinha 2', 'linha 1\n\nlinha 2'],
    ['caractere\u0000de\u0007controle', 'caracteredecontrole'],
    ['a < b e c > d', 'a < b e c > d'], // "<" solto é texto, não tag
  ])('%j -> %j', (entrada, saida) => {
    expect(limparTextoLivre(entrada)).toBe(saida);
  });

  // Entradas patológicas: o texto exato não importa, a garantia sim
  test.each([
    '&amp;lt;script&amp;gt;alert(1)', // codificado duas vezes
    '&amp;amp;lt;img src=x onerror=alert(1)&amp;amp;gt;', // três vezes
    '<<script>script>alert(1)<</script>/script>',
    '<scr<script>ipt>alert(1)</script>',
    '<svg/onload=alert(1)>',
    '<!--<img src=x onerror=alert(1)>-->',
  ])('nenhuma tag sobrevive: %j', (entrada) => {
    expect(limparTextoLivre(entrada)).not.toMatch(/<[a-zA-Z/!?]/);
  });
});

describe('gerarSlug', () => {
  test.each([
    ['Pastel da Maria — Feira do Pacaembu!', 'pastel-da-maria-feira-do-pacaembu'],
    ['Café São Paulo   Ação', 'cafe-sao-paulo-acao'],
    ['---Já---', 'ja'],
  ])('%j -> %j', (entrada, saida) => {
    expect(gerarSlug(entrada)).toBe(saida);
  });
});
