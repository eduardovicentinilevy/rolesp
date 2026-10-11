// Controllers só traduzem HTTP: leem a entrada já validada e devolvem status + JSON.
import * as lugaresService from '../services/lugaresService.js';

export async function listar(req, res) {
  res.json(await lugaresService.listar(req.validado.query));
}

export async function detalhar(req, res) {
  res.json(await lugaresService.detalhar(req.validado.params.slug, req.validado.query.lang));
}

export async function dicaDoDia(req, res) {
  res.json(await lugaresService.dicaDoDia(req.validado.query.lang));
}
