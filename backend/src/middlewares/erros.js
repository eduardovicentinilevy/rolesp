// Middleware central de erros: todo erro da API sai no mesmo formato JSON.
//   { "erro": { "codigo", "mensagem", "detalhes"?, "request_id" } }
// Em produção, erros inesperados nunca expõem stack trace nem SQL.
import { ambiente } from '../config/ambiente.js';
import { CODIGOS_PG, ErroApp } from '../utils/erros.js';

// Nome da constraint UNIQUE -> campo, para o front destacar o campo certo
const CAMPO_POR_CONSTRAINT = {
  lugares_slug_unico: 'slug',
  bairros_slug_unico: 'slug',
  roteiros_slug_unico: 'slug',
  categorias_slug_unico: 'slug',
  tags_slug_unico: 'slug',
  admins_email_unico: 'email',
};

function traduzirErroDoPostgres(erro) {
  switch (erro.code) {
    case CODIGOS_PG.VIOLACAO_UNICA: {
      const campo = CAMPO_POR_CONSTRAINT[erro.constraint];
      return new ErroApp(
        409,
        'CONFLITO',
        campo ? `Já existe um registro com este ${campo}.` : 'Registro duplicado.',
        campo ? [{ campo, mensagem: 'Valor já está em uso.' }] : undefined,
      );
    }
    case CODIGOS_PG.VIOLACAO_FK:
      // INSERT/UPDATE apontando para algo que não existe. (DELETE bloqueado por RESTRICT
      // é tratado no service com traduzirErroDeExclusao, que devolve 409.)
      return new ErroApp(422, 'REFERENCIA_INVALIDA', 'Referência a um registro que não existe.');
    case CODIGOS_PG.VIOLACAO_CHECK:
    case CODIGOS_PG.VIOLACAO_NOT_NULL:
    case CODIGOS_PG.TEXTO_INVALIDO:
    case CODIGOS_PG.FORA_DO_INTERVALO:
      // O zod deveria ter barrado antes; o banco é a segunda linha de defesa
      return new ErroApp(400, 'VALIDACAO', 'Dados inválidos.', [
        { campo: erro.column ?? erro.constraint ?? 'desconhecido', mensagem: 'Valor não permitido.' },
      ]);
    case CODIGOS_PG.CONSULTA_CANCELADA:
      return new ErroApp(503, 'INDISPONIVEL', 'A consulta demorou demais. Tente novamente.');
    default:
      return null;
  }
}

function traduzirErroDoExpress(erro) {
  // Erros lançados pelo express.json()
  if (erro.type === 'entity.parse.failed') {
    return new ErroApp(400, 'CORPO_INVALIDO', 'O corpo da requisição não é um JSON válido.');
  }
  if (erro.type === 'entity.too.large') {
    return new ErroApp(413, 'CORPO_GRANDE_DEMAIS', 'O corpo da requisição é grande demais.');
  }
  if (erro.code === 'ECONNREFUSED' || erro.message?.includes('timeout exceeded when trying to connect')) {
    return new ErroApp(503, 'INDISPONIVEL', 'Serviço temporariamente indisponível.');
  }
  return null;
}

export function rotaNaoEncontrada(req, _res, next) {
  next(new ErroApp(404, 'ROTA_NAO_ENCONTRADA', `Rota ${req.method} ${req.path} não existe.`));
}

// eslint-disable-next-line no-unused-vars -- o Express reconhece o handler de erro pelos 4 parâmetros
export function tratarErros(erro, req, res, _next) {
  const conhecido =
    erro instanceof ErroApp ? erro : (traduzirErroDoPostgres(erro) ?? traduzirErroDoExpress(erro));

  if (!conhecido) {
    // Erro inesperado: log completo (com stack) só no servidor
    req.log.error({ err: erro }, 'erro inesperado');
  } else if (conhecido.status >= 500) {
    req.log.error({ err: erro, codigo: conhecido.codigo }, conhecido.message);
  }

  const status = conhecido?.status ?? 500;
  const corpo = {
    erro: {
      codigo: conhecido?.codigo ?? 'ERRO_INTERNO',
      mensagem: conhecido?.message ?? 'Erro interno. Tente novamente mais tarde.',
      ...(conhecido?.detalhes && { detalhes: conhecido.detalhes }),
      request_id: req.id,
    },
  };
  if (!conhecido && !ambiente.emProducao && ambiente.NODE_ENV !== 'test') {
    corpo.erro.depuracao = erro.message; // só em desenvolvimento
  }
  res.status(status).json(corpo);
}
