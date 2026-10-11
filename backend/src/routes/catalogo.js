import { Router } from 'express';
import * as catalogoController from '../controllers/catalogoController.js';

export const rotasCategorias = Router();
rotasCategorias.get('/', catalogoController.listarCategorias);

export const rotasTags = Router();
rotasTags.get('/', catalogoController.listarTags);

export const rotaSaude = Router();
rotaSaude.get('/', catalogoController.saude);
