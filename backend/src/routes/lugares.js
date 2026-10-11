import { Router } from 'express';
import * as lugaresController from '../controllers/lugaresController.js';
import { validar } from '../middlewares/validar.js';
import { esquemaDetalhe, esquemaDicaDoDia, esquemaListagem } from '../schemas/lugares.js';

export const rotasLugares = Router();

rotasLugares.get('/', validar(esquemaListagem), lugaresController.listar);
rotasLugares.get('/:slug', validar(esquemaDetalhe), lugaresController.detalhar);

export const rotasDicaDoDia = Router();

rotasDicaDoDia.get('/', validar(esquemaDicaDoDia), lugaresController.dicaDoDia);
