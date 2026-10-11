// Montador de consultas parametrizadas.
//
// Cada valor vindo do usuário vira um placeholder ($1, $2, ...) e vai separado do SQL
// para o banco. Nada do usuário é concatenado no texto da query: isso é o que impede
// SQL injection. Só trechos fixos, escritos aqui no código, entram no SQL.
export class Consulta {
  constructor() {
    this.valores = [];
    this.condicoes = [];
    this.nomeados = new Map();
  }

  // Guarda o valor e devolve o placeholder correspondente, ex.: "$3"
  param(valor) {
    this.valores.push(valor);
    return `$${this.valores.length}`;
  }

  // Mesmo valor usado em vários pontos da query: cria o placeholder só na primeira vez.
  // Criar sob demanda importa: o Postgres recusa um parâmetro enviado e nunca usado
  // ("could not determine data type of parameter").
  paramNomeado(nome, valor) {
    if (!this.nomeados.has(nome)) this.nomeados.set(nome, this.param(valor));
    return this.nomeados.get(nome);
  }

  // Adiciona uma condição ao WHERE. "montar" recebe a função param para criar placeholders.
  onde(montar) {
    this.condicoes.push(montar((valor) => this.param(valor)));
    return this;
  }

  get where() {
    return this.condicoes.length > 0 ? `WHERE ${this.condicoes.join('\n  AND ')}` : '';
  }
}

// Escapa os curingas do LIKE (%, _ e a própria barra). Sem isso, buscar "100%" ou "_"
// viraria um padrão, e não o texto literal.
export function escaparLike(texto) {
  return texto.replace(/[\\%_]/g, (caractere) => `\\${caractere}`);
}

export function calcularPaginacao({ pagina, limite }, total) {
  return {
    pagina,
    limite,
    total,
    total_paginas: Math.ceil(total / limite),
  };
}
