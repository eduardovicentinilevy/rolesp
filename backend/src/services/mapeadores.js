// Transformam linhas "achatadas" do SQL nos objetos que a API devolve.
// Ficam num lugar só porque lugares, roteiros e a dica do dia usam o mesmo formato.

export function mapearLugarResumo(linha) {
  return {
    slug: linha.slug,
    nome: linha.nome,
    categoria: {
      slug: linha.categoria_slug,
      nome: linha.categoria_nome,
      icone: linha.categoria_icone,
    },
    bairro: { slug: linha.bairro_slug, nome: linha.bairro_nome },
    faixa_preco: linha.faixa_preco,
    is_bairrista: linha.is_bairrista,
    verificado: linha.verificado,
    latitude: linha.latitude,
    longitude: linha.longitude,
    imagem_url: linha.imagem_url,
    imagem_alt: linha.imagem_alt ?? null,
    descricao: linha.descricao ?? null,
    dica_local: linha.dica_local ?? null,
    idioma_conteudo: linha.idioma_conteudo ?? null,
    media_notas: linha.media_notas,
    total_avaliacoes: linha.total_avaliacoes,
    tags: linha.tags ?? [],
  };
}

export function mapearLugarDetalhe(linha) {
  return {
    ...mapearLugarResumo(linha),
    endereco: linha.endereco,
    site: linha.site,
    instagram: linha.instagram,
    imagem_credito: linha.imagem_credito,
    verificado_em: linha.verificado_em,
    horario_observacao: linha.horario_observacao ?? null,
    horarios: linha.horarios ?? [],
    roteiros: linha.roteiros ?? [],
    atualizado_em: linha.atualizado_em,
  };
}
