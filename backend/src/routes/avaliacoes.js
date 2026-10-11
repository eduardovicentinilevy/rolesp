// TODO: implementar (avaliações públicas e moderação)
import { Router } from 'express';

// mergeParams: enxerga o :slug definido em /lugares/:slug/avaliacoes
export const rotasAvaliacoesPublicas = Router({ mergeParams: true });
export const rotasAvaliacoesAdmin = Router();
