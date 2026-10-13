// Formatação, busca com autocompletar, gráfico de barras, dica (tooltip) e tabela paginada.

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const moedaInteira = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const inteiro = new Intl.NumberFormat('pt-BR');
const percentual = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0, signDisplay: 'exceptZero' });
const proporcao = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 });

export const fmt = {
  moeda: (v) => moeda.format(v),
  moedaInteira: (v) => moedaInteira.format(v),
  inteiro: (v) => inteiro.format(v),
  percentual: (v) => percentual.format(v),
  proporcao: (v) => proporcao.format(v),
  decimalCsv: (v) => v.toFixed(2).replace('.', ','),
  cbo: (c) => `${c.slice(0, 4)}-${c.slice(4)}`,
};

export const POUCOS_DADOS = 5;

export const normalizar = (texto) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function elemento(tag, classe, texto) {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

export function selo(q) {
  return q < POUCOS_DADOS ? elemento('span', 'selo', 'poucos dados') : null;
}

/* ---------- Busca com autocompletar (combobox acessível) ---------- */

export function criarCombobox({ entrada, lista, obterOpcoes, aoEscolher, limite = 80 }) {
  let visiveis = [];
  let ativo = -1;
  let rotuloAtual = '';

  const abrir = () => {
    lista.hidden = false;
    entrada.setAttribute('aria-expanded', 'true');
  };

  const fechar = () => {
    lista.hidden = true;
    ativo = -1;
    entrada.setAttribute('aria-expanded', 'false');
    entrada.removeAttribute('aria-activedescendant');
  };

  function filtrar() {
    const termos = normalizar(entrada.value.trim()).split(/\s+/).filter(Boolean);
    const encontradas = obterOpcoes().filter((o) => termos.every((t) => o.busca.includes(t)));
    if (termos.length) {
      const primeiro = termos[0];
      encontradas.sort((a, b) => Number(!a.busca.startsWith(primeiro)) - Number(!b.busca.startsWith(primeiro)));
    }
    visiveis = encontradas.slice(0, limite);
    ativo = -1;
    desenhar();
  }

  function desenhar() {
    lista.replaceChildren();
    if (!visiveis.length) {
      const vazio = elemento('li', 'vazio', 'Nenhum resultado');
      vazio.setAttribute('aria-disabled', 'true');
      lista.append(vazio);
    }
    visiveis.forEach((opcao, i) => {
      const item = elemento('li');
      item.id = `${lista.id}-${i}`;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', 'false');
      item.append(elemento('span', '', opcao.rotulo));
      if (opcao.detalhe) item.append(elemento('span', 'detalhe', opcao.detalhe));
      item.addEventListener('mousedown', (evento) => {
        evento.preventDefault();
        escolher(i);
      });
      lista.append(item);
    });
    abrir();
  }

  function mover(passo) {
    if (!visiveis.length) return;
    ativo = (ativo + passo + visiveis.length) % visiveis.length;
    [...lista.children].forEach((item, i) => item.setAttribute('aria-selected', String(i === ativo)));
    const item = lista.children[ativo];
    entrada.setAttribute('aria-activedescendant', item.id);
    item.scrollIntoView({ block: 'nearest' });
  }

  function escolher(i) {
    const opcao = visiveis[i];
    if (!opcao) return;
    definir(opcao.rotulo);
    fechar();
    aoEscolher(opcao.valor);
  }

  function confirmarTexto() {
    if (!entrada.value.trim() && rotuloAtual) {
      definir('');
      aoEscolher('');
    } else {
      entrada.value = rotuloAtual;
    }
  }

  function definir(rotulo) {
    rotuloAtual = rotulo || '';
    entrada.value = rotuloAtual;
  }

  entrada.addEventListener('input', filtrar);
  entrada.addEventListener('focus', () => entrada.select());
  entrada.addEventListener('blur', () => {
    fechar();
    confirmarTexto();
  });
  entrada.addEventListener('keydown', (evento) => {
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      if (lista.hidden) filtrar();
      mover(1);
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      mover(-1);
    } else if (evento.key === 'Enter') {
      evento.preventDefault();
      if (!lista.hidden && ativo >= 0) escolher(ativo);
      else if (!lista.hidden && visiveis.length === 1) escolher(0);
      else if (!entrada.value.trim()) confirmarTexto();
    } else if (evento.key === 'Escape' && !lista.hidden) {
      evento.preventDefault();
      fechar();
      entrada.value = rotuloAtual;
    }
  });

  return { definir };
}

/* ---------- Dica (tooltip) ---------- */

const dica = document.getElementById('dica');

function preencherDica({ titulo, itens }) {
  dica.replaceChildren(elemento('p', 'dica-titulo', titulo));
  for (const item of itens) {
    const linha = elemento('div', 'dica-linha');
    linha.append(elemento('span', `dica-chave ${item.chave || ''}`), elemento('strong', '', item.valor), elemento('span', '', item.rotulo));
    dica.append(linha);
  }
  dica.hidden = false;
}

function posicionarDica(x, y) {
  const margem = 12;
  const { width, height } = dica.getBoundingClientRect();
  let esquerda = x + margem;
  let topo = y + margem;
  if (esquerda + width > window.innerWidth - margem) esquerda = x - width - margem;
  if (topo + height > window.innerHeight - margem) topo = y - height - margem;
  dica.style.left = `${Math.max(margem, esquerda)}px`;
  dica.style.top = `${Math.max(margem, topo)}px`;
}

export function esconderDica() {
  dica.hidden = true;
}

function ligarDica(alvo, conteudo) {
  alvo.addEventListener('pointerenter', (e) => {
    preencherDica(conteudo);
    posicionarDica(e.clientX, e.clientY);
  });
  alvo.addEventListener('pointermove', (e) => posicionarDica(e.clientX, e.clientY));
  alvo.addEventListener('pointerleave', esconderDica);
  alvo.addEventListener('focus', () => {
    preencherDica(conteudo);
    const caixa = alvo.getBoundingClientRect();
    posicionarDica(caixa.left + caixa.width * 0.5, caixa.bottom - 4);
  });
  alvo.addEventListener('blur', esconderDica);
}

/* ---------- Gráfico de barras horizontais ---------- */
// linhas: [{ rotulo, detalhe?, valor, marca?, texto, q, dica, enfase?, aoClicar? }]
// valor = comprimento da barra (sempre a partir do zero); marca = traço da média.

export function desenharBarras(alvo, linhas, { vazio = 'Sem dados para esta seleção.' } = {}) {
  esconderDica();
  alvo.replaceChildren();
  alvo.classList.toggle('com-enfase', linhas.some((l) => l.enfase));
  if (!linhas.length) {
    alvo.append(elemento('p', 'barras-vazio', vazio));
    return;
  }
  const maximo = Math.max(...linhas.map((l) => Math.max(l.valor, l.marca ?? 0))) || 1;

  for (const linha of linhas) {
    const item = elemento(linha.aoClicar ? 'button' : 'div', 'barra-linha');
    if (linha.aoClicar) {
      item.type = 'button';
      item.addEventListener('click', linha.aoClicar);
    } else {
      item.classList.add('inerte');
      item.tabIndex = 0;
    }
    if (linha.enfase) item.classList.add('enfase');
    item.setAttribute('aria-label', [linha.dica.titulo, ...linha.dica.itens.map((i) => `${i.rotulo} ${i.valor}`)].join(', '));

    const rotulo = elemento('span', 'barra-rotulo');
    const nome = elemento('span', 'barra-nome', linha.rotulo);
    const marcador = selo(linha.q ?? Infinity);
    if (marcador) nome.append(marcador);
    rotulo.append(nome);
    if (linha.detalhe) rotulo.append(elemento('span', 'barra-detalhe', linha.detalhe));

    const area = elemento('span', 'barra-area');
    const trilho = elemento('span', 'barra-trilho');
    const preenchimento = elemento('span', 'barra-preenchimento');
    preenchimento.style.width = `${(linha.valor / maximo) * 100}%`;
    trilho.append(preenchimento);
    if (linha.marca != null) {
      const marca = elemento('span', 'barra-marca');
      marca.style.left = `${(linha.marca / maximo) * 100}%`;
      trilho.append(marca);
    }
    area.append(trilho, elemento('span', 'barra-valor', linha.texto));
    item.append(rotulo, area);
    ligarDica(item, linha.dica);
    alvo.append(item);
  }
}

/* ---------- Tabela com busca, ordenação e paginação ---------- */
// colunas: [{ id, valor(linha) → chave de ordenação, celula(td, linha), num?, descPrimeiro? }]

export function criarTabela({ tabela, rodape, busca, colunas, textoBusca, aoClicar, selecionada, ordem, porPagina = 25, nomeItens }) {
  const corpo = tabela.tBodies[0];
  let dados = [];
  let filtrados = [];
  let pagina = 0;
  let avisoRodape = '';

  for (const th of tabela.tHead.rows[0].cells) {
    const botao = th.querySelector('button');
    botao.addEventListener('click', () => {
      const coluna = colunas.find((c) => c.id === botao.dataset.coluna);
      ordem = ordem.coluna === coluna.id
        ? { coluna: coluna.id, desc: !ordem.desc }
        : { coluna: coluna.id, desc: Boolean(coluna.descPrimeiro) };
      pagina = 0;
      aplicar();
    });
  }

  busca.addEventListener('input', () => {
    pagina = 0;
    aplicar();
  });

  function aplicar() {
    const termos = normalizar(busca.value.trim()).split(/\s+/).filter(Boolean);
    filtrados = termos.length
      ? dados.filter((linha) => {
        const texto = textoBusca(linha);
        return termos.every((t) => texto.includes(t));
      })
      : [...dados];

    const coluna = colunas.find((c) => c.id === ordem.coluna);
    const sinal = ordem.desc ? -1 : 1;
    filtrados.sort((a, b) => {
      const va = coluna.valor(a);
      const vb = coluna.valor(b);
      const comparacao = typeof va === 'string' ? va.localeCompare(vb, 'pt-BR') : va - vb;
      return comparacao * sinal;
    });
    desenhar();
  }

  function desenhar() {
    for (const th of tabela.tHead.rows[0].cells) {
      const id = th.querySelector('button').dataset.coluna;
      if (id === ordem.coluna) th.setAttribute('aria-sort', ordem.desc ? 'descending' : 'ascending');
      else th.removeAttribute('aria-sort');
    }

    corpo.replaceChildren();
    const inicio = pagina * porPagina;
    const visiveis = filtrados.slice(inicio, inicio + porPagina);
    if (!visiveis.length) {
      const linha = elemento('tr', 'vazio');
      const celula = elemento('td', '', 'Nenhum resultado para esta seleção.');
      celula.colSpan = colunas.length;
      linha.append(celula);
      corpo.append(linha);
    }
    for (const dado of visiveis) {
      const linha = elemento('tr');
      if (selecionada(dado)) linha.classList.add('selecionada');
      for (const coluna of colunas) {
        const celula = elemento('td', coluna.num ? 'num' : '');
        coluna.celula(celula, dado);
        linha.append(celula);
      }
      linha.tabIndex = 0;
      linha.addEventListener('click', () => aoClicar(dado));
      linha.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') aoClicar(dado);
      });
      corpo.append(linha);
    }

    const total = filtrados.length;
    const resumo = total
      ? `${fmt.inteiro(inicio + 1)}–${fmt.inteiro(Math.min(inicio + porPagina, total))} de ${fmt.inteiro(total)} ${nomeItens}`
      : `0 ${nomeItens}`;
    const anterior = elemento('button', '', 'Anterior');
    const proxima = elemento('button', '', 'Próxima');
    anterior.type = 'button';
    proxima.type = 'button';
    anterior.disabled = pagina === 0;
    proxima.disabled = inicio + porPagina >= total;
    anterior.addEventListener('click', () => { pagina -= 1; desenhar(); });
    proxima.addEventListener('click', () => { pagina += 1; desenhar(); });
    const paginacao = elemento('div', 'paginacao');
    paginacao.append(anterior, proxima);
    const texto = elemento('span', '', avisoRodape ? `${resumo} · ${avisoRodape}` : resumo);
    rodape.replaceChildren(texto, paginacao);
  }

  return {
    definir(novos, aviso = '') {
      dados = novos;
      avisoRodape = aviso;
      pagina = 0;
      aplicar();
    },
    visiveis: () => filtrados,
    redesenhar: desenhar,
  };
}

/* ---------- Exportação CSV (padrão do Excel em português) ---------- */

export function baixarCsv(nomeArquivo, cabecalho, linhas) {
  const campo = (v) => {
    if (typeof v === 'number') return String(v).replace('.', ',');
    const texto = String(v ?? '');
    return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  const conteudo = [cabecalho, ...linhas].map((linha) => linha.map(campo).join(';')).join('\r\n');
  const blob = new Blob(['﻿', conteudo], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = elemento('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
