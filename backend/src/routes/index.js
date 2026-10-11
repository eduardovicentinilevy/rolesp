// Mapa de todas as rotas da API (montado em /api pelo app.js).
import { Router } from 'express';
import { autenticar } from '../middlewares/autenticar.js';
import { semCache } from '../middlewares/protecoes.js';
import { rotasAuth } from './auth.js';
import { rotasAvaliacoesAdmin, rotasAvaliacoesPublicas } from './avaliacoes.js';
import { rotasBairros, rotasBairrosAdmin } from './bairros.js';
import { rotaSaude, rotasCategorias, rotasTags } from './catalogo.js';
import { rotasDicaDoDia, rotasLugares } from './lugares.js';
import { rotasLugaresAdmin } from './lugaresAdmin.js';
import { rotasRoteiros, rotasRoteirosAdmin } from './roteiros.js';

export const rotas = Router();

// Públicas
rotas.use('/saude', rotaSaude);
rotas.use('/lugares/:slug/avaliacoes', rotasAvaliacoesPublicas);
rotas.use('/lugares', rotasLugares);
rotas.use('/dica-do-dia', rotasDicaDoDia);
rotas.use('/bairros', rotasBairros);
rotas.use('/categorias', rotasCategorias);
rotas.use('/tags', rotasTags);
rotas.use('/roteiros', rotasRoteiros);

// Login
rotas.use('/auth', rotasAuth);

// Admin: tudo abaixo exige sessão válida e nunca vai para cache
const rotasAdmin = Router();
rotasAdmin.use('/lugares', rotasLugaresAdmin);
rotasAdmin.use('/bairros', rotasBairrosAdmin);
rotasAdmin.use('/roteiros', rotasRoteirosAdmin);
rotasAdmin.use('/avaliacoes', rotasAvaliacoesAdmin);

rotas.use('/admin', semCache, autenticar, rotasAdmin);
