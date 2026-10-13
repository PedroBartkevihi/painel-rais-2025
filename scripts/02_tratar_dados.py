"""Transforma a extração do BigQuery na base tratada e nos arquivos de dados do painel.

Uso:
    python scripts/02_tratar_dados.py

Entrada (dados/brutos/, gerada por 01_extrair_bigquery.py):
    01_diretorio_municipios.parquet, 02_diretorio_cbo.parquet,
    03_diagnostico.parquet, 04_remuneracao_cbo_niveis.parquet
Saída:
    docs/downloads/  base tratada para download (CSV no formato pedido + Parquet com todos os níveis)
    docs/dados/      JSON compactos que o painel carrega sob demanda
"""
import json
import re
import shutil
import unicodedata
import zipfile
from datetime import date
from pathlib import Path

import duckdb

RAIZ = Path(__file__).resolve().parents[1]
BRUTOS = RAIZ / "dados" / "brutos"
DOWNLOADS = RAIZ / "docs" / "downloads"
PAINEL = RAIZ / "docs" / "dados"

ARQUIVO_CSV = "rais2025_remuneracao_cbo_municipio.csv"
ARQUIVO_PARQUET = "rais2025_remuneracao_cbo_niveis.parquet"

NOMES_UF = {
    "AC": "Acre", "AL": "Alagoas", "AP": "Amapá", "AM": "Amazonas", "BA": "Bahia",
    "CE": "Ceará", "DF": "Distrito Federal", "ES": "Espírito Santo", "GO": "Goiás",
    "MA": "Maranhão", "MT": "Mato Grosso", "MS": "Mato Grosso do Sul", "MG": "Minas Gerais",
    "PA": "Pará", "PB": "Paraíba", "PR": "Paraná", "PE": "Pernambuco", "PI": "Piauí",
    "RJ": "Rio de Janeiro", "RN": "Rio Grande do Norte", "RS": "Rio Grande do Sul",
    "RO": "Rondônia", "RR": "Roraima", "SC": "Santa Catarina", "SP": "São Paulo",
    "SE": "Sergipe", "TO": "Tocantins",
}

# Nomes oficiais dos grandes grupos da CBO 2002. Os grupos 7 e 8 têm o mesmo nome na CBO;
# o complemento entre parênteses vem da própria descrição da classificação.
GRANDES_GRUPOS = {
    "0": "Membros das forças armadas, policiais e bombeiros militares",
    "1": "Membros superiores do poder público, dirigentes de organizações de interesse público e de empresas, gerentes",
    "2": "Profissionais das ciências e das artes",
    "3": "Técnicos de nível médio",
    "4": "Trabalhadores de serviços administrativos",
    "5": "Trabalhadores dos serviços, vendedores do comércio em lojas e mercados",
    "6": "Trabalhadores agropecuários, florestais e da pesca",
    "7": "Trabalhadores da produção de bens e serviços industriais (processos discretos)",
    "8": "Trabalhadores da produção de bens e serviços industriais (processos contínuos)",
    "9": "Trabalhadores em serviços de reparação e manutenção",
}

# O diretório da Base dos Dados traz os títulos em "Title Case" ("Acabador De Calçados").
# A CBO oficial usa caixa de frase ("Acabador de calçados"); estas siglas voltam ao original.
SIGLAS = {"cnc": "CNC", "dj": "DJ", "dpo": "DPO", "pcp": "PCP", "tv": "TV", "epiv": "EPIV",
          "apo": "APO", "fac": "FAC", "p&d": "P&D", "libras": "Libras"}
# Nomes de instituições, que continuam com maiúsculas na caixa de frase
NOMES_PROPRIOS = [
    "República", "Supremo Tribunal Federal", "Superior Tribunal de Justiça", "Superior Tribunal Militar",
    "Superior Tribunal do Trabalho", "Distrito Federal", "Ministro de Estado", "Advogado da União",
    "Receita Federal", "Polícia Federal", "Justiça Militar",
]


def ordem_alfabetica(texto):
    """Chave de ordenação em português: ignora acentos e maiúsculas (Pará < Paraíba < Paraná)."""
    sem_acento = unicodedata.normalize("NFD", texto).encode("ascii", "ignore").decode()
    return sem_acento.casefold()


def caixa_de_frase(titulo):
    texto = " ".join(titulo.split()).lower()
    texto = re.sub(r"[\w&]+", lambda m: SIGLAS.get(m.group(0), m.group(0)), texto)
    for nome in NOMES_PROPRIOS:
        texto = re.sub(rf"\b{nome.lower()}\b", nome, texto)
    return texto[:1].upper() + texto[1:]


def parquet(nome):
    return f"read_parquet('{(BRUTOS / f'{nome}.parquet').as_posix()}')"


def preparar(con):
    con.execute(f"CREATE TABLE municipios AS SELECT * FROM {parquet('01_diretorio_municipios')}")
    con.execute(f"CREATE TABLE agregado AS SELECT * FROM {parquet('04_remuneracao_cbo_niveis')}")
    con.create_function("caixa_de_frase", caixa_de_frase, ["VARCHAR"], "VARCHAR")
    con.execute(f"CREATE TABLE cbo AS SELECT cbo_2002, caixa_de_frase(titulo) AS titulo FROM {parquet('02_diretorio_cbo')}")

    for tabela, chave in (("municipios", "id_municipio"), ("cbo", "cbo_2002")):
        repetidos = con.execute(f"SELECT count(*) - count(DISTINCT {chave}) FROM {tabela}").fetchone()[0]
        assert repetidos == 0, f"{tabela} tem {repetidos} códigos repetidos"

    # Base tratada com nomes: uma linha por nível, território e ocupação
    con.execute("""
        CREATE TABLE base AS
        SELECT
            a.nivel                  AS NIVEL,
            a.uf                     AS UF,
            r.nome_regiao_imediata   AS REGIAO,
            m.municipio              AS MUNICIPIO,
            a.cbo_2002               AS CBO2002,
            c.titulo                 AS TITULO,
            a.media                  AS MEDIA,
            a.qtde                   AS QTDE,
            a.mediana                AS MEDIANA,
            a.id_regiao              AS ID_REGIAO,
            a.id_municipio           AS ID_MUNICIPIO
        FROM agregado AS a
        JOIN cbo AS c USING (cbo_2002)
        LEFT JOIN (SELECT DISTINCT id_regiao_imediata, nome_regiao_imediata FROM municipios) AS r
               ON r.id_regiao_imediata = a.id_regiao
        LEFT JOIN municipios AS m USING (id_municipio)
    """)

    # Conferência: cada nível precisa somar o mesmo total de vínculos
    totais = con.execute("SELECT NIVEL, sum(QTDE) FROM base GROUP BY NIVEL").fetchall()
    assert len({total for _, total in totais}) == 1, f"totais diferentes entre níveis: {totais}"
    linhas = con.execute("SELECT count(*) FROM base").fetchone()[0]
    assert linhas == con.execute("SELECT count(*) FROM agregado").fetchone()[0], "a junção perdeu ou duplicou linhas"
    return totais[0][1]


def exportar_downloads(con):
    if DOWNLOADS.exists():
        shutil.rmtree(DOWNLOADS)
    DOWNLOADS.mkdir(parents=True)

    csv = DOWNLOADS / ARQUIVO_CSV
    con.execute(f"""
        COPY (
            SELECT UF, REGIAO, MUNICIPIO, CBO2002, TITULO,
                   CAST(MEDIA AS DECIMAL(12, 2)) AS MEDIA, QTDE, CAST(MEDIANA AS DECIMAL(12, 2)) AS MEDIANA
            FROM base
            WHERE NIVEL = 'MUNICIPIO'
            ORDER BY UF, REGIAO COLLATE NOACCENT.NOCASE, MUNICIPIO COLLATE NOACCENT.NOCASE, CBO2002
        ) TO '{csv.as_posix()}' (HEADER, DELIMITER ',')
    """)
    with zipfile.ZipFile(csv.with_suffix(".csv.zip"), "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        zf.write(csv, csv.name)
    csv.unlink()

    con.execute(f"""
        COPY (
            SELECT * FROM base
            ORDER BY CASE NIVEL WHEN 'BRASIL' THEN 1 WHEN 'UF' THEN 2 WHEN 'REGIAO' THEN 3 ELSE 4 END,
                     UF, ID_REGIAO, ID_MUNICIPIO, CBO2002
        ) TO '{(DOWNLOADS / ARQUIVO_PARQUET).as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)
    """)


def colunar(con, sql, parametros=()):
    """Executa uma consulta (grupo, código, qtde, média, mediana) e devolve, para cada grupo,
    o formato colunar do painel: [[códigos], [qtde], [média], [mediana]], ordenado pelo código."""
    consulta = f"""
        SELECT grupo, list(codigo ORDER BY codigo), list(qtde ORDER BY codigo),
               list(media ORDER BY codigo), list(mediana ORDER BY codigo)
        FROM ({sql}) GROUP BY grupo
    """
    return {grupo: [codigos, q, me, md] for grupo, codigos, q, me, md in con.execute(consulta, parametros).fetchall()}


def salvar_json(caminho, dados):
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(json.dumps(dados, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def exportar_painel(con, total_vinculos):
    if PAINEL.exists():
        shutil.rmtree(PAINEL)

    diagnostico = con.execute(f"SELECT * EXCLUDE (percentis) FROM {parquet('03_diagnostico')}").fetchdf()
    funil = {k: (round(float(v), 2) if "remuneracao" in k else int(v)) for k, v in diagnostico.iloc[0].items()}
    assert funil["universo_final"] == total_vinculos, "funil e base tratada não batem"

    regioes = con.execute("""
        SELECT DISTINCT id_regiao_imediata, nome_regiao_imediata, sigla_uf FROM municipios
    """).fetchall()
    municipios = con.execute("SELECT id_municipio, municipio, sigla_uf, id_regiao_imediata FROM municipios").fetchall()
    grande_regiao = dict(con.execute("SELECT DISTINCT sigla_uf, grande_regiao FROM municipios").fetchall())
    ocupacoes = con.execute("""
        SELECT cbo_2002, titulo FROM cbo WHERE cbo_2002 IN (SELECT DISTINCT CBO2002 FROM base) ORDER BY cbo_2002
    """).fetchall()

    salvar_json(PAINEL / "meta.json", {
        "ano": 2025,
        "gerado_em": date.today().isoformat(),
        "funil": funil,
        "ufs": [{"sigla": s, "nome": n, "regiao": grande_regiao[s]}
                for s, n in sorted(NOMES_UF.items(), key=lambda i: ordem_alfabetica(i[1]))],
        "regioes": {int(i): [n, uf] for i, n, uf in sorted(regioes)},
        "municipios": {int(i): [n, uf, int(r)] for i, n, uf, r in sorted(municipios)},
        "ocupacoes": dict(ocupacoes),
        "grupos": GRANDES_GRUPOS,
    })

    # Brasil e UFs: todas as ocupações de cada território
    por_territorio = """
        SELECT {grupo} AS grupo, CAST(CBO2002 AS INTEGER) AS codigo, QTDE AS qtde, MEDIA AS media, MEDIANA AS mediana
        FROM base WHERE {filtro}
    """
    salvar_json(PAINEL / "brasil.json", {
        "BR": colunar(con, por_territorio.format(grupo="'BR'", filtro="NIVEL = 'BRASIL'"))["BR"],
        "UF": colunar(con, por_territorio.format(grupo="UF", filtro="NIVEL = 'UF'")),
    })

    # Um arquivo por UF, com todas as ocupações de cada região imediata (R) e de cada município (M)
    for uf in NOMES_UF:
        salvar_json(PAINEL / "uf" / f"{uf}.json", {
            "R": colunar(con, por_territorio.format(grupo="CAST(ID_REGIAO AS INTEGER)", filtro="NIVEL = 'REGIAO' AND UF = ?"), [uf]),
            "M": colunar(con, por_territorio.format(grupo="CAST(ID_MUNICIPIO AS INTEGER)", filtro="NIVEL = 'MUNICIPIO' AND UF = ?"), [uf]),
        })

    # Um arquivo por ocupação, com todas as regiões (R) e municípios (M) onde ela aparece
    por_ocupacao = """
        SELECT CBO2002 AS grupo, CAST({id} AS INTEGER) AS codigo, QTDE AS qtde, MEDIA AS media, MEDIANA AS mediana
        FROM base WHERE NIVEL = '{nivel}'
    """
    regioes_cbo = colunar(con, por_ocupacao.format(id="ID_REGIAO", nivel="REGIAO"))
    municipios_cbo = colunar(con, por_ocupacao.format(id="ID_MUNICIPIO", nivel="MUNICIPIO"))
    for codigo in regioes_cbo:
        salvar_json(PAINEL / "cbo" / f"{codigo}.json", {"R": regioes_cbo[codigo], "M": municipios_cbo[codigo]})


def main():
    con = duckdb.connect()
    total = preparar(con)
    print(f"Base tratada: {total:,} vínculos em {con.execute('SELECT count(*) FROM base').fetchone()[0]:,} linhas")
    exportar_downloads(con)
    exportar_painel(con, total)
    for pasta in (DOWNLOADS, PAINEL):
        arquivos = [f for f in pasta.rglob("*") if f.is_file()]
        print(f"{pasta.relative_to(RAIZ)}: {len(arquivos):,} arquivos, {sum(f.stat().st_size for f in arquivos) / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
