import { Consulta, calcularPaginacao, escaparLike } from '../../src/utils/consulta.js';

describe('Consulta (montador de SQL parametrizado)', () => {
  test('cada valor vira um placeholder e fica fora do texto do SQL', () => {
    const consulta = new Consulta();
    consulta.onde((p) => `nome = ${p("'; DROP TABLE lugares; --")}`);
    consulta.onde((p) => `preco = ANY(${p([1, 2])})`);

    expect(consulta.where).toBe('WHERE nome = $1\n  AND preco = ANY($2)');
    expect(consulta.valores).toEqual(["'; DROP TABLE lugares; --", [1, 2]]);
    expect(consulta.where).not.toContain('DROP');
  });

  test('paramNomeado reaproveita o mesmo placeholder e só cria se for usado', () => {
    const consulta = new Consulta();
    expect(consulta.paramNomeado('idioma', 'en')).toBe('$1');
    expect(consulta.paramNomeado('idioma', 'en')).toBe('$1');
    expect(consulta.valores).toEqual(['en']);
  });

  test('sem condições, o WHERE fica vazio', () => {
    expect(new Consulta().where).toBe('');
  });
});

test('escaparLike trata %, _ e \\ como texto literal', () => {
  expect(escaparLike('100%_ok\\')).toBe('100\\%\\_ok\\\\');
});

test('calcularPaginacao arredonda o total de páginas para cima', () => {
  expect(calcularPaginacao({ pagina: 1, limite: 20 }, 41)).toEqual({
    pagina: 1,
    limite: 20,
    total: 41,
    total_paginas: 3,
  });
});
