import { carregarInicio, carregarUf, carregarCbo, linhas, buscar } from './dados.js';
import {
  fmt, normalizar, elemento, selo, criarCombobox, desenharBarras, criarTabela, baixarCsv, esconderDica, POUCOS_DADOS,
} from './componentes.js';

const $ = (seletor) => document.querySelector(seletor);

const MINIMOS = [1, 5, 10, 30, 100];
const MINIMO_PADRAO = 10;
const estado = { uf: '', regiao: '', municipio: '', cbo: '', grupo: '', minimo: MINIMO_PADRAO, ordemSub: 'md' };

let meta;
let brasil;
let gruposComDados = new Set();
const nomeUf = {};
let opcoesOcupacao = [];
let opcoesMunicipio = [];
let ufDasRegioes = null;
let versao = 0;

const ui = {
  filtros: $('#filtros'),
  conteudo: $('#conteudo'),
  uf: $('#f-uf'),
  regiao: $('#f-regiao'),
  grupo: $('#f-grupo'),
  minimo: $('#f-minimo'),
  limpar: $('#limpar'),
  tema: $('#tema'),
  contexto: $('#contexto'),
  kpis: $('#kpis'),
  secaoOcupacao: $('#secao-ocupacao'),
  tituloOcupacao: $('#titulo-ocupacao'),
  descricaoOcupacao: $('#descricao-ocupacao'),
  gradeOcupacao: $('#grade-ocupacao'),
  cartaoNiveis: $('#cartao-niveis'),
  gNiveis: $('#g-niveis'),
  tituloSub: $('#titulo-sub'),
  subtituloSub: $('#subtitulo-sub'),
  gSub: $('#g-sub'),
  alternador: document.querySelectorAll('.alternador button'),
  tituloDetalhe: $('#titulo-detalhe'),
  tituloTerritorio: $('#titulo-territorio'),
  descricaoTerritorio: $('#descricao-territorio'),
  subtituloMedianas: $('#subtitulo-medianas'),
  gMedianas: $('#g-medianas'),
  gEmpregos: $('#g-empregos'),
  tituloTabela: $('#titulo-tabela'),
  funil: $('#funil'),
  geradoEm: $('#gerado-em'),
};

const codigo = (numero) => String(numero).padStart(6, '0');
const tituloCbo = (cbo) => meta.ocupacoes[cbo] ?? `CBO ${fmt.cbo(cbo)}`;
const nomeRegiao = (id) => meta.regioes[id]?.[0] ?? '';
const nomeMunicipio = (id) => meta.municipios[id]?.[0] ?? '';
const plural = (q, singular, pluralTexto) => (q === 1 ? singular : pluralTexto);

function descreverTerritorio() {
  if (estado.municipio) return `${nomeMunicipio(estado.municipio)} (${estado.uf})`;
  if (estado.regiao) return `${nomeRegiao(estado.regiao)} (região imediata · ${estado.uf})`;
  if (estado.uf) return nomeUf[estado.uf];
  return 'Brasil';
}

/* ---------- Dados do território e da ocupação selecionados ---------- */

async function territorio() {
  if (estado.municipio || estado.regiao) {
    const dadosUf = await carregarUf(estado.uf);
    return estado.municipio
      ? { nivel: 'MUNICIPIO', colunas: dadosUf.M[estado.municipio] }
      : { nivel: 'REGIAO', colunas: dadosUf.R[estado.regiao] };
  }
  if (estado.uf) return { nivel: 'UF', colunas: brasil.UF[estado.uf] };
  return { nivel: 'BRASIL', colunas: brasil.BR };
}

function ocupacoesDoTerritorio(terr) {
  return linhas(terr.colunas)
    .map((l) => {
      const cbo = codigo(l.id);
      return { cbo, titulo: tituloCbo(cbo), q: l.q, me: l.me, md: l.md };
    })
    .filter((l) => !estado.grupo || l.cbo[0] === estado.grupo);
}

function valorOcupacao(nivel, dadosCbo) {
  const id = Number(estado.cbo);
  if (nivel === 'BRASIL') return buscar(brasil.BR, id);
  if (nivel === 'UF') return buscar(brasil.UF[estado.uf], id);
  if (nivel === 'REGIAO') return buscar(dadosCbo.R, Number(estado.regiao));
  return buscar(dadosCbo.M, Number(estado.municipio));
}

function municipiosDaOcupacao(dadosCbo) {
  return linhas(dadosCbo.M).map((l) => {
    const [municipio, uf, idRegiao] = meta.municipios[l.id] ?? [`Município ${l.id}`, '', 0];
    return { id: l.id, municipio, uf, idRegiao, regiao: nomeRegiao(idRegiao), q: l.q, me: l.me, md: l.md };
  });
}

/* ---------- Atualização geral ---------- */

async function atualizar({ gravarHistorico = true, rolarPara = null } = {}) {
  const minhaVersao = ++versao;
  sincronizarControles();
  if (gravarHistorico) gravarHash();
  ui.conteudo.classList.add('carregando');
  try {
    const [terr, dadosCbo] = await Promise.all([territorio(), estado.cbo ? carregarCbo(estado.cbo) : null]);
    if (minhaVersao !== versao) return;
    const ocupacoes = ocupacoesDoTerritorio(terr);
    esconderErro();
    desenharContexto();
    desenharKpis(terr, ocupacoes, dadosCbo);
    desenharOcupacao(terr, dadosCbo);
    desenharTerritorio(ocupacoes);
    if (rolarPara) {
      const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      rolarPara.scrollIntoView({ behavior: reduzir ? 'auto' : 'smooth', block: 'start' });
    }
  } catch (erro) {
    if (minhaVersao === versao) mostrarErro(erro);
  } finally {
    if (minhaVersao === versao) ui.conteudo.classList.remove('carregando');
  }
}

function irPara(mudancas, opcoes) {
  Object.assign(estado, mudancas);
  atualizar(opcoes);
}

function escolherMunicipio(id) {
  if (!id) {
    irPara({ municipio: '' });
    return;
  }
  const [, uf, idRegiao] = meta.municipios[id];
  irPara({ uf, regiao: String(idRegiao), municipio: String(id) });
}

function escolherOcupacao(cbo, rolar = false) {
  irPara({ cbo }, { rolarPara: rolar && cbo ? ui.secaoOcupacao : null });
}

/* ---------- Filtros e endereço (hash) ---------- */

function preencherFiltros() {
  for (const uf of meta.ufs) {
    nomeUf[uf.sigla] = uf.nome;
    ui.uf.append(new Option(uf.nome, uf.sigla));
  }
  // O grande grupo 0 (militares) não tem vínculos nos microdados públicos: só entram grupos com dados
  gruposComDados = new Set(Object.keys(meta.ocupacoes).map((cbo) => cbo[0]));
  for (const [id, descricao] of Object.entries(meta.grupos).sort(([a], [b]) => a.localeCompare(b))) {
    if (gruposComDados.has(id)) ui.grupo.append(new Option(`${id} · ${descricao}`, id));
  }

  opcoesOcupacao = Object.entries(meta.ocupacoes)
    .map(([cbo, titulo]) => ({
      valor: cbo,
      rotulo: titulo,
      detalhe: fmt.cbo(cbo),
      busca: normalizar(`${titulo} ${cbo} ${fmt.cbo(cbo)}`),
    }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));

  opcoesMunicipio = Object.entries(meta.municipios)
    .map(([id, [nome, uf]]) => ({ valor: id, rotulo: nome, detalhe: uf, uf, busca: normalizar(`${nome} ${uf}`) }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));

  ui.funil.replaceChildren();
  const f = meta.funil;
  const etapas = [
    ['Vínculos declarados na RAIS 2025', f.vinculos_2025],
    ['Ativos em 31/12/2025', f.ativos_3112],
    ['sem remuneração no ano', -f.descartados_sem_remuneracao],
    ['município não identificado', -f.descartados_municipio_invalido],
    ['ocupação (CBO) inválida ou não informada', -f.descartados_cbo_invalido],
    ['Vínculos usados no painel', f.universo_final],
  ];
  etapas.forEach(([texto, valor], i) => {
    const item = elemento('li', i === etapas.length - 1 ? 'final' : '');
    const removido = valor < 0;
    item.append(
      elemento('span', removido ? 'menos' : '', removido ? `− ${texto}` : texto),
      elemento('strong', removido ? 'menos' : '', removido ? `− ${fmt.inteiro(-valor)}` : fmt.inteiro(valor)),
    );
    ui.funil.append(item);
  });
  const [ano, mes, dia] = meta.gerado_em.split('-');
  ui.geradoEm.textContent = `Dados processados em ${dia}/${mes}/${ano}.`;
}

function preencherRegioes() {
  if (ufDasRegioes === estado.uf) return;
  ufDasRegioes = estado.uf;
  ui.regiao.replaceChildren(new Option('Todas', ''));
  if (!estado.uf) return;
  Object.entries(meta.regioes)
    .filter(([, [, uf]]) => uf === estado.uf)
    .sort(([, [a]], [, [b]]) => a.localeCompare(b, 'pt-BR'))
    .forEach(([id, [nome]]) => ui.regiao.append(new Option(nome, id)));
}

function sincronizarControles() {
  ui.uf.value = estado.uf;
  preencherRegioes();
  ui.regiao.disabled = !estado.uf;
  ui.regiao.value = estado.regiao;
  comboMunicipio.definir(estado.municipio ? nomeMunicipio(estado.municipio) : '');
  comboOcupacao.definir(estado.cbo ? tituloCbo(estado.cbo) : '');
  ui.grupo.value = estado.grupo;
  ui.minimo.value = String(estado.minimo);
  ui.alternador.forEach((botao) => botao.setAttribute('aria-pressed', String(botao.dataset.ordem === estado.ordemSub)));
}

function gravarHash() {
  const parametros = new URLSearchParams();
  for (const chave of ['uf', 'regiao', 'municipio', 'cbo', 'grupo']) {
    if (estado[chave]) parametros.set(chave, estado[chave]);
  }
  if (estado.minimo !== MINIMO_PADRAO) parametros.set('min', estado.minimo);
  if (estado.ordemSub !== 'md') parametros.set('ordem', estado.ordemSub);
  const hash = parametros.toString();
  if (location.hash.slice(1) !== hash) {
    history.pushState(null, '', hash ? `#${hash}` : `${location.pathname}${location.search}`);
  }
}

function lerHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const uf = p.get('uf') ?? '';
  estado.uf = nomeUf[uf] ? uf : '';
  const regiao = p.get('regiao') ?? '';
  estado.regiao = estado.uf && meta.regioes[regiao]?.[1] === estado.uf ? regiao : '';
  const municipio = meta.municipios[p.get('municipio') ?? ''];
  if (municipio) {
    estado.municipio = p.get('municipio');
    estado.uf = municipio[1];
    estado.regiao = String(municipio[2]);
  } else {
    estado.municipio = '';
  }
  const cbo = p.get('cbo') ?? '';
  estado.cbo = meta.ocupacoes[cbo] ? cbo : '';
  const grupo = p.get('grupo') ?? '';
  estado.grupo = gruposComDados.has(grupo) ? grupo : '';
  const minimo = Number(p.get('min'));
  estado.minimo = MINIMOS.includes(minimo) ? minimo : MINIMO_PADRAO;
  estado.ordemSub = p.get('ordem') === 'q' ? 'q' : 'md';
}

/* ---------- Contexto (trilha) ---------- */

function desenharContexto() {
  const itens = [];
  const passo = (texto, mudancas) => {
    const botao = elemento('button', 'passo', texto);
    botao.type = 'button';
    botao.addEventListener('click', () => irPara(mudancas));
    return botao;
  };
  const niveis = [['Brasil', { uf: '', regiao: '', municipio: '' }]];
  if (estado.uf) niveis.push([nomeUf[estado.uf], { regiao: '', municipio: '' }]);
  if (estado.regiao) niveis.push([`${nomeRegiao(estado.regiao)} (região imediata)`, { municipio: '' }]);
  if (estado.municipio) niveis.push([nomeMunicipio(estado.municipio), {}]);
  niveis.forEach(([texto, mudancas], i) => {
    if (i) itens.push(elemento('span', 'separador', '›'));
    itens.push(i === niveis.length - 1 ? elemento('span', 'atual', texto) : passo(texto, mudancas));
  });
  if (estado.cbo) {
    const chip = elemento('span', 'chip', tituloCbo(estado.cbo));
    const remover = elemento('button', '', '✕');
    remover.type = 'button';
    remover.setAttribute('aria-label', 'Remover filtro de ocupação');
    remover.addEventListener('click', () => irPara({ cbo: '' }));
    chip.append(remover);
    itens.push(chip);
  }
  ui.contexto.replaceChildren(...itens);
}

/* ---------- Indicadores ---------- */

function kpi(rotulo, valor, nota, { textoLongo = false } = {}) {
  const cartao = elemento('article', 'kpi');
  cartao.append(elemento('p', 'kpi-rotulo', rotulo), elemento('p', `kpi-valor${textoLongo ? ' texto-longo' : ''}`, valor));
  if (nota) cartao.append(elemento('p', 'kpi-nota', nota));
  return cartao;
}

function desenharKpis(terr, ocupacoes, dadosCbo) {
  if (!estado.cbo) {
    const total = ocupacoes.reduce((s, l) => s + l.q, 0);
    const massa = ocupacoes.reduce((s, l) => s + l.q * l.me, 0);
    const maior = ocupacoes.reduce((a, l) => (!a || l.q > a.q ? l : a), null);
    ui.kpis.replaceChildren(
      kpi('Vínculos ativos em 31/12/2025', fmt.inteiro(total), estado.grupo ? 'No grande grupo selecionado' : 'Empregos formais com remuneração'),
      kpi('Remuneração média', total ? fmt.moeda(massa / total) : '—', 'Média de todos os vínculos, ponderada'),
      kpi('Ocupações com vínculos', fmt.inteiro(ocupacoes.length), 'Códigos da CBO 2002 presentes'),
      kpi('Ocupação que mais emprega', maior ? maior.titulo : '—', maior ? `${fmt.inteiro(maior.q)} vínculos` : '', { textoLongo: true }),
    );
    return;
  }

  const valor = valorOcupacao(terr.nivel, dadosCbo);
  if (!valor) {
    ui.kpis.replaceChildren(kpi('Vínculos ativos em 31/12/2025', '0', `Nenhum vínculo de ${tituloCbo(estado.cbo)} neste território`));
    return;
  }
  const diferenca = valor.me / valor.md - 1;
  const cartoes = [
    kpi('Vínculos ativos em 31/12/2025', fmt.inteiro(valor.q), valor.q < POUCOS_DADOS ? 'Poucos dados: leia com cautela' : descreverTerritorio()),
    kpi('Remuneração mediana', fmt.moeda(valor.md), 'Metade ganha menos, metade ganha mais'),
    kpi('Remuneração média', fmt.moeda(valor.me), Math.abs(diferenca) < 0.005
      ? 'Praticamente igual à mediana'
      : `${fmt.proporcao(Math.abs(diferenca))} ${diferenca > 0 ? 'acima' : 'abaixo'} da mediana`),
  ];

  if (terr.nivel === 'BRASIL') {
    const ranking = linhas(brasil.BR).filter((l) => l.q >= estado.minimo).sort((a, b) => b.md - a.md);
    const posicao = ranking.findIndex((l) => l.id === Number(estado.cbo)) + 1;
    cartoes.push(posicao
      ? kpi('Posição pela mediana', `${fmt.inteiro(posicao)}º de ${fmt.inteiro(ranking.length)}`, `Entre ocupações com ${estado.minimo}+ vínculos no Brasil`)
      : kpi('Posição pela mediana', '—', `Menos de ${estado.minimo} vínculos no Brasil`));
  } else {
    const nacional = buscar(brasil.BR, Number(estado.cbo));
    const variacao = valor.md / nacional.md - 1;
    const igual = Math.abs(variacao) < 0.005;
    const comparacao = kpi(
      'Comparado ao Brasil',
      igual ? 'Igual' : fmt.percentual(variacao),
      igual ? `Mediana nacional: ${fmt.moeda(nacional.md)}` : `Mediana ${variacao > 0 ? 'acima' : 'abaixo'} da nacional (${fmt.moeda(nacional.md)})`,
    );
    if (!igual) comparacao.querySelector('.kpi-valor').classList.add(variacao > 0 ? 'positivo' : 'negativo');
    cartoes.push(comparacao);
  }
  ui.kpis.replaceChildren(...cartoes);
}

/* ---------- Seção da ocupação selecionada ---------- */

function barraTerritorio(rotulo, valor, extras = {}) {
  return {
    rotulo,
    detalhe: estado.ordemSub === 'q' ? `${fmt.inteiro(valor.q)} ${plural(valor.q, 'vínculo', 'vínculos')}` : '',
    valor: valor.md,
    marca: valor.me,
    texto: fmt.moedaInteira(valor.md),
    q: valor.q,
    dica: {
      titulo: rotulo,
      itens: [
        { chave: 's1', valor: fmt.moeda(valor.md), rotulo: 'mediana' },
        { chave: 's2', valor: fmt.moeda(valor.me), rotulo: 'média' },
        { valor: fmt.inteiro(valor.q), rotulo: plural(valor.q, 'vínculo', 'vínculos') },
      ],
    },
    ...extras,
  };
}

function desenharOcupacao(terr, dadosCbo) {
  ui.secaoOcupacao.hidden = !estado.cbo;
  if (!estado.cbo) return;
  const id = Number(estado.cbo);
  const titulo = tituloCbo(estado.cbo);
  ui.tituloOcupacao.textContent = titulo;
  ui.descricaoOcupacao.textContent = `CBO ${fmt.cbo(estado.cbo)} · ${meta.grupos[estado.cbo[0]] ?? ''}`;

  // Mesma ocupação em cada nível: município → região → UF → Brasil
  const niveis = [];
  if (estado.municipio) niveis.push([nomeMunicipio(estado.municipio), buscar(dadosCbo.M, Number(estado.municipio))]);
  if (estado.regiao) niveis.push([`${nomeRegiao(estado.regiao)} (região imediata)`, buscar(dadosCbo.R, Number(estado.regiao))]);
  if (estado.uf) niveis.push([nomeUf[estado.uf], buscar(brasil.UF[estado.uf], id)]);
  niveis.push(['Brasil', buscar(brasil.BR, id)]);
  ui.cartaoNiveis.hidden = niveis.length === 1;
  ui.gradeOcupacao.classList.toggle('um', niveis.length === 1);
  desenharBarras(ui.gNiveis, niveis.filter(([, v]) => v).map(([rotulo, v]) => barraTerritorio(rotulo, v, {
    detalhe: `${fmt.inteiro(v.q)} ${plural(v.q, 'vínculo', 'vínculos')}`,
  })));

  // Recorte abaixo do território atual
  const municipios = municipiosDaOcupacao(dadosCbo);
  let candidatos;
  let limite = 15;
  if (terr.nivel === 'BRASIL') {
    ui.tituloSub.textContent = 'Por UF';
    limite = 27;
    candidatos = meta.ufs
      .map((uf) => ({ rotulo: uf.nome, valor: buscar(brasil.UF[uf.sigla], id), aoClicar: () => irPara({ uf: uf.sigla, regiao: '', municipio: '' }) }));
  } else if (terr.nivel === 'UF') {
    ui.tituloSub.textContent = 'Por região imediata';
    candidatos = linhas(dadosCbo.R)
      .filter((l) => meta.regioes[l.id]?.[1] === estado.uf)
      .map((l) => ({ rotulo: nomeRegiao(l.id), valor: l, aoClicar: () => irPara({ regiao: String(l.id), municipio: '' }) }));
  } else {
    ui.tituloSub.textContent = terr.nivel === 'REGIAO' ? 'Por município' : 'Municípios da mesma região imediata';
    candidatos = municipios
      .filter((m) => m.idRegiao === Number(estado.regiao))
      .map((m) => ({ rotulo: m.municipio, valor: m, enfase: String(m.id) === estado.municipio, aoClicar: () => escolherMunicipio(m.id) }));
  }
  const comDados = candidatos.filter((c) => c.valor);
  const elegiveis = comDados.filter((c) => c.valor.q >= estado.minimo || c.enfase);
  elegiveis.sort((a, b) => b.valor[estado.ordemSub] - a.valor[estado.ordemSub]);
  let exibidos = elegiveis.slice(0, limite);
  const selecionado = elegiveis.find((c) => c.enfase);
  if (selecionado && !exibidos.includes(selecionado)) exibidos = [...exibidos.slice(0, limite - 1), selecionado];
  const criterio = estado.ordemSub === 'md' ? 'maiores medianas' : 'mais vínculos';
  ui.subtituloSub.textContent = elegiveis.length > exibidos.length
    ? `${exibidos.length} ${criterio} entre ${fmt.inteiro(elegiveis.length)} com ${estado.minimo}+ vínculos`
    : `${fmt.inteiro(elegiveis.length)} com ${estado.minimo}+ vínculos${comDados.length > elegiveis.length ? ` (${fmt.inteiro(comDados.length - elegiveis.length)} com menos ficaram de fora)` : ''}`;
  desenharBarras(
    ui.gSub,
    exibidos.map((c) => barraTerritorio(c.rotulo, c.valor, { enfase: c.enfase, aoClicar: c.aoClicar })),
    { vazio: `Nenhum território com ${estado.minimo} ou mais vínculos desta ocupação.` },
  );

  // Tabela de municípios (como a tabela detalhada do painel de referência)
  let escopo = municipios;
  if (terr.nivel === 'UF') escopo = municipios.filter((m) => m.uf === estado.uf);
  if (terr.nivel === 'REGIAO' || terr.nivel === 'MUNICIPIO') escopo = municipios.filter((m) => m.idRegiao === Number(estado.regiao));
  const visiveis = escopo.filter((m) => m.q >= estado.minimo || String(m.id) === estado.municipio);
  const ocultos = escopo.length - visiveis.length;
  ui.tituloDetalhe.textContent = `Municípios com vínculos de ${titulo}`;
  tabelaDetalhe.definir(visiveis, ocultos ? `${fmt.inteiro(ocultos)} com menos de ${estado.minimo} vínculos ocultos` : '');
}

/* ---------- Seção do território ---------- */

function barraOcupacao(l, campo) {
  return {
    rotulo: l.titulo,
    valor: l[campo],
    texto: campo === 'md' ? fmt.moedaInteira(l.md) : fmt.inteiro(l.q),
    q: l.q,
    enfase: l.cbo === estado.cbo,
    aoClicar: () => escolherOcupacao(l.cbo, true),
    dica: {
      titulo: `${l.titulo} · ${fmt.cbo(l.cbo)}`,
      itens: [
        { chave: campo === 'md' ? 's1' : '', valor: fmt.moeda(l.md), rotulo: 'mediana' },
        { valor: fmt.moeda(l.me), rotulo: 'média' },
        { chave: campo === 'q' ? 's1' : '', valor: fmt.inteiro(l.q), rotulo: plural(l.q, 'vínculo', 'vínculos') },
      ],
    },
  };
}

function desenharTerritorio(ocupacoes) {
  const nome = descreverTerritorio();
  ui.tituloTerritorio.textContent = `Panorama · ${nome}`;
  ui.descricaoTerritorio.textContent = estado.grupo
    ? `Grande grupo ${estado.grupo}: ${meta.grupos[estado.grupo]}`
    : 'Todas as ocupações com vínculos ativos. Clique em uma ocupação para ver o detalhe.';

  const elegiveis = ocupacoes.filter((l) => l.q >= estado.minimo);
  ui.subtituloMedianas.textContent = `Ocupações com ${estado.minimo}+ vínculos`;
  desenharBarras(
    ui.gMedianas,
    [...elegiveis].sort((a, b) => b.md - a.md).slice(0, 10).map((l) => barraOcupacao(l, 'md')),
    { vazio: `Nenhuma ocupação com ${estado.minimo} ou mais vínculos.` },
  );
  desenharBarras(
    ui.gEmpregos,
    [...ocupacoes].sort((a, b) => b.q - a.q).slice(0, 10).map((l) => barraOcupacao(l, 'q')),
  );

  const ocultas = ocupacoes.length - elegiveis.length;
  ui.tituloTabela.textContent = `Todas as ocupações · ${nome}`;
  tabelaOcupacoes.definir(elegiveis, ocultas ? `${fmt.inteiro(ocultas)} com menos de ${estado.minimo} vínculos ocultas` : '');
}

/* ---------- Tabelas ---------- */

function celulaTexto(td, texto, q) {
  td.textContent = texto;
  const marcador = q === undefined ? null : selo(q);
  if (marcador) td.append(marcador);
}

const colunasNumericas = [
  { id: 'q', valor: (l) => l.q, celula: (td, l) => { td.textContent = fmt.inteiro(l.q); }, num: true, descPrimeiro: true },
  { id: 'me', valor: (l) => l.me, celula: (td, l) => { td.textContent = fmt.moeda(l.me); }, num: true, descPrimeiro: true },
  { id: 'md', valor: (l) => l.md, celula: (td, l) => { td.textContent = fmt.moeda(l.md); }, num: true, descPrimeiro: true },
];

const tabelaOcupacoes = criarTabela({
  tabela: $('#t-ocupacoes'),
  rodape: $('#rodape-ocupacoes'),
  busca: $('#busca-ocupacoes'),
  nomeItens: 'ocupações',
  ordem: { coluna: 'q', desc: true },
  colunas: [
    { id: 'titulo', valor: (l) => l.titulo, celula: (td, l) => celulaTexto(td, l.titulo, l.q) },
    { id: 'cbo', valor: (l) => l.cbo, celula: (td, l) => { td.className = 'codigo'; td.textContent = fmt.cbo(l.cbo); } },
    ...colunasNumericas,
  ],
  textoBusca: (l) => normalizar(`${l.titulo} ${l.cbo} ${fmt.cbo(l.cbo)}`),
  selecionada: (l) => l.cbo === estado.cbo,
  aoClicar: (l) => escolherOcupacao(l.cbo, true),
});

const tabelaDetalhe = criarTabela({
  tabela: $('#t-detalhe'),
  rodape: $('#rodape-detalhe'),
  busca: $('#busca-detalhe'),
  nomeItens: 'municípios',
  ordem: { coluna: 'q', desc: true },
  colunas: [
    { id: 'uf', valor: (l) => l.uf, celula: (td, l) => { td.textContent = l.uf; } },
    { id: 'regiao', valor: (l) => l.regiao, celula: (td, l) => { td.textContent = l.regiao; } },
    { id: 'municipio', valor: (l) => l.municipio, celula: (td, l) => celulaTexto(td, l.municipio, l.q) },
    ...colunasNumericas,
  ],
  textoBusca: (l) => normalizar(`${l.municipio} ${l.regiao} ${l.uf}`),
  selecionada: (l) => String(l.id) === estado.municipio,
  aoClicar: (l) => escolherMunicipio(l.id),
});

/* ---------- Combobox ---------- */

const comboOcupacao = criarCombobox({
  entrada: $('#f-ocupacao'),
  lista: $('#l-ocupacao'),
  obterOpcoes: () => opcoesOcupacao,
  aoEscolher: (cbo) => escolherOcupacao(cbo),
});

const comboMunicipio = criarCombobox({
  entrada: $('#f-municipio'),
  lista: $('#l-municipio'),
  // Municípios da UF selecionada aparecem primeiro; os demais continuam pesquisáveis
  obterOpcoes: () => (estado.uf
    ? [...opcoesMunicipio.filter((o) => o.uf === estado.uf), ...opcoesMunicipio.filter((o) => o.uf !== estado.uf)]
    : opcoesMunicipio),
  aoEscolher: escolherMunicipio,
});

/* ---------- Erros ---------- */

function mostrarErro(erro) {
  console.error(erro);
  let aviso = $('#erro');
  if (!aviso) {
    aviso = elemento('div', 'erro');
    aviso.id = 'erro';
    aviso.setAttribute('role', 'alert');
    ui.conteudo.prepend(aviso);
  }
  aviso.textContent = 'Não foi possível carregar os dados. Verifique a conexão e recarregue a página.';
}

function esconderErro() {
  $('#erro')?.remove();
}

/* ---------- Eventos ---------- */

function ligarEventos() {
  ui.filtros.addEventListener('submit', (e) => e.preventDefault());
  ui.uf.addEventListener('change', () => irPara({ uf: ui.uf.value, regiao: '', municipio: '' }));
  ui.regiao.addEventListener('change', () => irPara({ regiao: ui.regiao.value, municipio: '' }));
  ui.grupo.addEventListener('change', () => irPara({ grupo: ui.grupo.value }));
  ui.minimo.addEventListener('change', () => irPara({ minimo: Number(ui.minimo.value) }));
  ui.limpar.addEventListener('click', () => {
    document.querySelectorAll('.tabela-acoes .busca').forEach((busca) => { busca.value = ''; });
    irPara({ uf: '', regiao: '', municipio: '', cbo: '', grupo: '', minimo: MINIMO_PADRAO, ordemSub: 'md' });
  });
  ui.alternador.forEach((botao) => botao.addEventListener('click', () => irPara({ ordemSub: botao.dataset.ordem })));

  $('#csv-ocupacoes').addEventListener('click', () => {
    const territorioCsv = descreverTerritorio();
    baixarCsv(
      `rais2025_ocupacoes_${normalizar(territorioCsv).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}.csv`,
      ['TERRITORIO', 'CBO2002', 'TITULO', 'MEDIA', 'QTDE', 'MEDIANA'],
      tabelaOcupacoes.visiveis().map((l) => [territorioCsv, l.cbo, l.titulo, fmt.decimalCsv(l.me), l.q, fmt.decimalCsv(l.md)]),
    );
  });

  $('#csv-detalhe').addEventListener('click', () => {
    const titulo = tituloCbo(estado.cbo);
    baixarCsv(
      `rais2025_${estado.cbo}_municipios.csv`,
      ['UF', 'REGIAO', 'MUNICIPIO', 'CBO2002', 'TITULO', 'MEDIA', 'QTDE', 'MEDIANA'],
      tabelaDetalhe.visiveis().map((l) => [l.uf, l.regiao, l.municipio, estado.cbo, titulo, fmt.decimalCsv(l.me), l.q, fmt.decimalCsv(l.md)]),
    );
  });

  ui.tema.addEventListener('click', () => {
    const raiz = document.documentElement;
    const escuro = raiz.dataset.theme ? raiz.dataset.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    raiz.dataset.theme = escuro ? 'light' : 'dark';
    try {
      localStorage.setItem('tema', raiz.dataset.theme);
    } catch (e) {
      // armazenamento indisponível: o tema vale só nesta visita
    }
  });

  window.addEventListener('popstate', () => {
    lerHash();
    atualizar({ gravarHistorico: false });
  });
  window.addEventListener('scroll', esconderDica, { passive: true });
  window.addEventListener('resize', esconderDica);
}

async function iniciar() {
  try {
    ({ meta, brasil } = await carregarInicio());
  } catch (erro) {
    mostrarErro(erro);
    ui.conteudo.classList.remove('carregando');
    return;
  }
  preencherFiltros();
  ligarEventos();
  lerHash();
  await atualizar({ gravarHistorico: false });
}

iniciar();
