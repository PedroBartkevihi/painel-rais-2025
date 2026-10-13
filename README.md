# Remunerações por Profissão (CBO) · RAIS 2025

Painel interativo com a remuneração **média**, a **mediana** e o número de **vínculos** de cada ocupação da CBO 2002 no Brasil, por UF, região imediata e município, a partir dos microdados públicos da RAIS 2025.

- **Painel:** https://pedrobartkevihi.github.io/painel-rais-2025/
- **Base tratada:** [rais2025_remuneracao_cbo_municipio.csv.zip](docs/downloads/rais2025_remuneracao_cbo_municipio.csv.zip) (formato pedido) · [rais2025_remuneracao_cbo_niveis.parquet](docs/downloads/rais2025_remuneracao_cbo_niveis.parquet) (todos os níveis)

Trabalho acadêmico inspirado no painel [Remunerações por Profissão (cargo – CBO)](https://www.ampliemais.com.br/remuneracoesporprofissao/) da Amplie+, refeito com os dados de 2025 e com a coluna de mediana.

## Como os dados foram obtidos

A fonte é a tabela `basedosdados.br_me_rais.microdados_vinculos`, da [Base dos Dados](https://basedosdados.org/dataset/3e7c4d58-96ba-448e-b053-d385a829ef00), que traz os microdados de vínculos da RAIS publicados pelo Ministério do Trabalho e Emprego. A tabela tem 445 GB e o download direto da BD é limitado a 1 GB, por isso a consulta foi feita no **BigQuery**, no modo sandbox gratuito.

As consultas estão em [`sql/`](sql) e rodam pelo script [`scripts/01_extrair_bigquery.py`](scripts/01_extrair_bigquery.py). Antes de executar, o script simula quantos dados cada consulta vai processar e trava o limite de bytes faturados. No total foram processados cerca de 11 GB, dentro da cota gratuita de 1 TB por mês.

## Tratamento

| Etapa | Vínculos |
|---|---:|
| Vínculos declarados na RAIS 2025 | 91.710.262 |
| Ativos em 31/12/2025 | 60.691.770 |
| − sem remuneração no ano (valor zerado) | 6.658.334 |
| − município fora do diretório do IBGE | 2.960 |
| − ocupação (CBO) inválida ou não informada | 529.434 |
| **Universo do painel** | **53.501.042** |

Decisões tomadas:

1. **Vínculos ativos em 31/12.** É o conceito de estoque de empregos formais da RAIS e evita contar duas vezes a mesma vaga quando alguém sai e é substituído no ano.
2. **Remuneração** = `valor_remuneracao_media`, a remuneração média mensal nominal do vínculo no ano, em R$. Os valores não são corrigidos pela inflação e não incluem o 13º salário.
3. **Remuneração zerada fica de fora.** Dos 6,66 milhões de vínculos ativos com valor zero, só 2% foram admitidos em dezembro e 12% tiveram afastamento. O restante é remuneração não informada pelo empregador, com peso grande de órgãos públicos estaduais e municipais ([`sql/05_analise_sem_remuneracao.sql`](sql/05_analise_sem_remuneracao.sql)). Contados como zero, eles puxariam média e mediana para baixo.
4. **Códigos validados** nos diretórios de municípios e de CBO da própria Base dos Dados.
5. **Mediana exata em cada nível.** A mediana não pode ser somada nem tirada da média das medianas dos municípios. Por isso ela foi calculada com `PERCENTILE_CONT` separadamente para o Brasil, cada UF, cada região imediata e cada município ([`sql/04_remuneracao_cbo_niveis.sql`](sql/04_remuneracao_cbo_niveis.sql)).
6. **REGIAO** é a Região Geográfica Imediata do IBGE (2017), a mesma divisão usada no painel de referência.
7. **Títulos da CBO em caixa de frase** ("Acabador de calçados"), como na classificação oficial. O diretório da BD traz todas as palavras com inicial maiúscula; siglas (CNC, DPO, P&D...) e nomes de instituições (República, Receita Federal...) foram preservados.
8. **Conferências automáticas** em [`scripts/02_tratar_dados.py`](scripts/02_tratar_dados.py): os quatro níveis somam o mesmo total de vínculos e batem com o funil, os diretórios não têm códigos repetidos e as junções não perdem nem duplicam linhas.

## Base tratada

**`rais2025_remuneracao_cbo_municipio.csv`** (dentro do .zip): 1.444.673 linhas, uma por município e ocupação. Está em UTF-8, com vírgula como separador e ponto como separador decimal. O arquivo passa do limite do Excel (1.048.576 linhas), então use Power BI, Python, R ou DuckDB para abri-lo.

| Coluna | Descrição |
|---|---|
| `UF` | Sigla da unidade da federação |
| `REGIAO` | Região geográfica imediata (IBGE, 2017) |
| `MUNICIPIO` | Município do estabelecimento empregador |
| `CBO2002` | Código da ocupação na CBO 2002 (6 dígitos) |
| `TITULO` | Título da ocupação |
| `MEDIA` | Média da remuneração média mensal nominal (R$) |
| `QTDE` | Vínculos ativos em 31/12/2025 com remuneração no ano |
| `MEDIANA` | Mediana da remuneração média mensal nominal (R$) |

**`rais2025_remuneracao_cbo_niveis.parquet`**: 1.954.099 linhas com as mesmas colunas e mais `NIVEL` (`BRASIL`, `UF`, `REGIAO` ou `MUNICIPIO`), `ID_REGIAO` e `ID_MUNICIPIO` (códigos do IBGE). É a base que alimenta o painel.

## O painel

Feito em HTML, CSS e JavaScript puro e publicado no GitHub Pages:

- filtros encadeados de UF → região imediata → município, com busca sem acento;
- busca de ocupação por nome ou código CBO, filtro por grande grupo da CBO e número mínimo de vínculos;
- indicadores do território ou da ocupação escolhida, incluindo a comparação com a mediana nacional;
- rankings das maiores medianas e das ocupações que mais empregam;
- para uma ocupação: comparação entre município, região, UF e Brasil, gráfico por UF, região ou município (média como traço sobre a barra da mediana) e a tabela detalhada no formato do painel de referência;
- tabelas com ordenação, busca, paginação e exportação para CSV;
- selo de "poucos dados" abaixo de 5 vínculos (57% das linhas município × ocupação estão nessa situação);
- endereço que guarda os filtros (dá para compartilhar uma visão), tema claro/escuro e layout para celular.

Os dados do painel ficam em `docs/dados/`, divididos em arquivos JSON por UF e por ocupação que só são baixados quando você escolhe aquele filtro.

## Como reproduzir

Requer Python 3.12 e um projeto no Google Cloud com o BigQuery ativo (o sandbox gratuito basta).

```bash
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt          # no Linux/macOS: .venv/bin/pip
.venv/Scripts/python scripts/01_extrair_bigquery.py <id-do-projeto> --simular
.venv/Scripts/python scripts/01_extrair_bigquery.py <id-do-projeto>
.venv/Scripts/python scripts/02_tratar_dados.py
.venv/Scripts/python scripts/servidor_local.py          # painel em http://localhost:8765
```

## Limitações

- A RAIS cobre só o **emprego formal** (CLT, estatutários, temporários etc.). Trabalho informal, autônomos e MEIs ficam de fora.
- O município é o do **estabelecimento empregador**. Desde 2023 a RAIS quase não informa o município onde o trabalho é feito, então empresas com sede em uma cidade e equipes em outra concentram os vínculos na sede.
- A ocupação (CBO) é **declarada pelo empregador**.
- Os microdados públicos de 2025 não trazem vínculos do **grande grupo 0** da CBO (forças armadas, policiais e bombeiros militares).
- Os valores são **nominais de 2025**, sem correção pela inflação.
- Cruzamentos com poucos vínculos variam muito: use o filtro de mínimo de vínculos.

---

Fonte: RAIS 2025, Ministério do Trabalho e Emprego, via Base dos Dados. Elaboração: Pedro Farias Bartkevihi de Mello e Alvim.
