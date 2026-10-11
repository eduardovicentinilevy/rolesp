// SQL da tabela admins (autenticação do painel).
import { pool } from '../db/pool.js';

// lower(email) usa o índice único admins_email_unico, criado sobre lower(email)
export async function buscarPorEmail(email, executor = pool) {
  const { rows } = await executor.query(
    `SELECT id, email, senha_hash, tentativas_falhas, bloqueado_ate
       FROM admins
      WHERE lower(email) = lower($1)`,
    [email],
  );
  return rows[0] ?? null;
}

export async function buscarPorId(id, executor = pool) {
  const { rows } = await executor.query('SELECT id, email FROM admins WHERE id = $1', [id]);
  return rows[0] ?? null;
}

// Conta uma falha e, ao atingir o limite, bloqueia a conta por alguns minutos.
// Tudo num UPDATE só (atômico): duas tentativas simultâneas não "perdem" uma contagem.
// No SET, toda expressão enxerga os valores ANTIGOS da linha, por isso o CASE se repete.
// Se o bloqueio anterior já venceu, a contagem recomeça do 1.
export async function registrarFalha(id, { limite, bloqueioMinutos }, executor = pool) {
  const { rows } = await executor.query(
    `UPDATE admins
        SET tentativas_falhas = CASE
              WHEN bloqueado_ate IS NOT NULL AND bloqueado_ate <= now() THEN 1
              ELSE tentativas_falhas + 1
            END,
            bloqueado_ate = CASE
              WHEN (CASE
                      WHEN bloqueado_ate IS NOT NULL AND bloqueado_ate <= now() THEN 1
                      ELSE tentativas_falhas + 1
                    END) >= $2
                THEN now() + make_interval(mins => $3)
              WHEN bloqueado_ate IS NOT NULL AND bloqueado_ate <= now() THEN NULL
              ELSE bloqueado_ate
            END
      WHERE id = $1
  RETURNING tentativas_falhas, bloqueado_ate`,
    [id, limite, bloqueioMinutos],
  );
  return rows[0];
}

export async function registrarSucesso(id, executor = pool) {
  await executor.query(
    `UPDATE admins
        SET tentativas_falhas = 0, bloqueado_ate = NULL, ultimo_login_em = now()
      WHERE id = $1`,
    [id],
  );
}

export async function criar(email, senhaHash, executor = pool) {
  const { rows } = await executor.query(
    'INSERT INTO admins (email, senha_hash) VALUES ($1, $2) RETURNING id, email',
    [email, senhaHash],
  );
  return rows[0];
}

export async function redefinirSenha(email, senhaHash, executor = pool) {
  const { rows } = await executor.query(
    `UPDATE admins
        SET senha_hash = $2, tentativas_falhas = 0, bloqueado_ate = NULL
      WHERE lower(email) = lower($1)
  RETURNING id, email`,
    [email, senhaHash],
  );
  return rows[0] ?? null;
}
