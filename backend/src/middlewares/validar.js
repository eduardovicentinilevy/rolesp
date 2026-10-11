// Valida params, query e body com esquemas zod.
// O resultado (já convertido: "2" vira 2, "true" vira true) fica em req.validado.
// No Express 5, req.query é somente leitura, por isso não sobrescrevemos o original.
import { erros } from '../utils/erros.js';

export function validar(esquemas) {
  return (req, _res, next) => {
    const validado = {};
    const detalhes = [];

    for (const [origem, esquema] of Object.entries(esquemas)) {
      const resultado = esquema.safeParse(req[origem] ?? {});
      if (resultado.success) {
        validado[origem] = resultado.data;
      } else {
        for (const problema of resultado.error.issues) {
          const caminho = problema.path.join('.');
          detalhes.push({
            origem,
            campo: caminho || (problema.keys ? problema.keys.join(', ') : origem),
            mensagem: problema.message,
          });
        }
      }
    }

    if (detalhes.length > 0) throw erros.validacao(detalhes);
    req.validado = validado;
    next();
  };
}
