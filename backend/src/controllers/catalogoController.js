import * as catalogoRepository from '../repositories/catalogoRepository.js';

// Sem regra de negócio aqui, o controller pode falar direto com o repository
export async function listarCategorias(_req, res) {
  res.json({ dados: await catalogoRepository.listarCategorias() });
}

export async function listarTags(_req, res) {
  res.json({ dados: await catalogoRepository.listarTags() });
}

// Health check do Cloud Run: 200 só se o banco responde
export async function saude(req, res) {
  try {
    await catalogoRepository.verificarBanco();
    res.json({ status: 'ok', banco: 'ok' });
  } catch (erro) {
    req.log.error({ err: erro }, 'health check: banco indisponível');
    res.status(503).json({ status: 'erro', banco: 'indisponivel' });
  }
}
