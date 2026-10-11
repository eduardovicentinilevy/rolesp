// Erros "esperados" da aplicação: carregam o status HTTP e um código estável,
// que o front usa para traduzir a mensagem.
export class ErroApp extends Error {
  constructor(status, codigo, mensagem, detalhes) {
    super(mensagem);
    this.name = 'ErroApp';
    this.status = status;
    this.codigo = codigo;
    this.detalhes = detalhes;
  }
}

export const erros = {
  validacao: (detalhes, mensagem = 'Dados inválidos.') =>
    new ErroApp(400, 'VALIDACAO', mensagem, detalhes),
  naoAutenticado: (mensagem = 'Faça login para continuar.') =>
    new ErroApp(401, 'NAO_AUTENTICADO', mensagem),
  credenciaisInvalidas: () =>
    new ErroApp(
      401,
      'CREDENCIAIS_INVALIDAS',
      'E-mail ou senha inválidos, ou acesso temporariamente bloqueado. Tente novamente em alguns minutos.',
    ),
  origemNaoPermitida: () =>
    new ErroApp(403, 'ORIGEM_NAO_PERMITIDA', 'Origem da requisição não permitida.'),
  naoEncontrado: (recurso = 'Recurso') =>
    new ErroApp(404, 'NAO_ENCONTRADO', `${recurso} não encontrado.`),
  conflito: (mensagem, detalhes) => new ErroApp(409, 'CONFLITO', mensagem, detalhes),
  emUso: (mensagem) => new ErroApp(409, 'EM_USO', mensagem),
  referenciaInvalida: (mensagem, detalhes) =>
    new ErroApp(422, 'REFERENCIA_INVALIDA', mensagem, detalhes),
  muitasRequisicoes: () =>
    new ErroApp(429, 'MUITAS_REQUISICOES', 'Muitas tentativas. Aguarde um pouco e tente de novo.'),
};

// Códigos de erro do PostgreSQL usados no projeto (SQLSTATE)
export const CODIGOS_PG = Object.freeze({
  VIOLACAO_UNICA: '23505',
  VIOLACAO_FK: '23503',
  VIOLACAO_CHECK: '23514',
  VIOLACAO_NOT_NULL: '23502',
  TEXTO_INVALIDO: '22P02',
  FORA_DO_INTERVALO: '22003',
  CONSULTA_CANCELADA: '57014', // estourou o statement_timeout
});

// Usado nos DELETEs: uma FK com RESTRICT bloqueou a exclusão -> 409 com mensagem clara
export async function traduzirErroDeExclusao(promessa, mensagem) {
  try {
    return await promessa;
  } catch (erro) {
    if (erro.code === CODIGOS_PG.VIOLACAO_FK) throw erros.emUso(mensagem);
    throw erro;
  }
}
