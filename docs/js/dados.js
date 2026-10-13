// Carregamento dos arquivos JSON gerados por scripts/02_tratar_dados.py.
// Cada território e cada ocupação vêm em formato colunar: [[códigos], [qtde], [média], [mediana]].

const cacheUf = new Map();
const cacheCbo = new Map();

async function json(caminho) {
  const resposta = await fetch(caminho);
  if (!resposta.ok) throw new Error(`Falha ao carregar ${caminho} (HTTP ${resposta.status})`);
  return resposta.json();
}

function emCache(cache, chave, caminho) {
  if (!cache.has(chave)) {
    cache.set(chave, json(caminho).catch((erro) => {
      cache.delete(chave);
      throw erro;
    }));
  }
  return cache.get(chave);
}

export async function carregarInicio() {
  const [meta, brasil] = await Promise.all([json('dados/meta.json'), json('dados/brasil.json')]);
  return { meta, brasil };
}

export const carregarUf = (uf) => emCache(cacheUf, uf, `dados/uf/${uf}.json`);
export const carregarCbo = (cbo) => emCache(cacheCbo, cbo, `dados/cbo/${cbo}.json`);

export function linhas(colunas) {
  if (!colunas) return [];
  const [ids, q, me, md] = colunas;
  return ids.map((id, i) => ({ id, q: q[i], me: me[i], md: md[i] }));
}

// Os vetores de códigos vêm ordenados, então a busca é binária.
export function buscar(colunas, id) {
  if (!colunas) return null;
  const [ids, q, me, md] = colunas;
  let inicio = 0;
  let fim = ids.length - 1;
  while (inicio <= fim) {
    const meio = (inicio + fim) >> 1;
    if (ids[meio] === id) return { id, q: q[meio], me: me[meio], md: md[meio] };
    if (ids[meio] < id) inicio = meio + 1;
    else fim = meio - 1;
  }
  return null;
}
