import { z } from 'zod';

export const esquemaLogin = {
  body: z
    .object({
      email: z.email('Informe um e-mail válido.').max(254).toLowerCase(),
      // limite alto o bastante para qualquer senha real, baixo o bastante para não virar DoS
      senha: z.string().min(1, 'Informe a senha.').max(200),
    })
    .strict(),
};
