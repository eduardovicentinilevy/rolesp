import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import { autenticar } from '../middlewares/autenticar.js';
import { limitarLogin } from '../middlewares/limitadores.js';
import { semCache } from '../middlewares/protecoes.js';
import { validar } from '../middlewares/validar.js';
import { esquemaLogin } from '../schemas/auth.js';

export const rotasAuth = Router();

rotasAuth.use(semCache);
rotasAuth.post('/login', limitarLogin, validar(esquemaLogin), authController.login);
rotasAuth.post('/logout', authController.logout);
rotasAuth.get('/me', autenticar, authController.eu);
