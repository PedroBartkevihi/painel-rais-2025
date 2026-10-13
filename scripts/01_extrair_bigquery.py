"""Roda as consultas da pasta sql/ no BigQuery (Base dos Dados) e salva cada resultado em Parquet.

Uso:
    python scripts/01_extrair_bigquery.py <id-do-projeto-google-cloud> [--simular] [consulta ...]

Sem nomes de consulta, roda todas (01 a 04). Com --simular, só mostra quantos GB cada
consulta processaria, sem executar. Na primeira execução o navegador abre para autorizar
o acesso ao BigQuery; a credencial fica salva para as próximas.
"""
import sys
import time
from pathlib import Path

import pyarrow.parquet as pq
import pydata_google_auth
from google.api_core.exceptions import GoogleAPIError
from google.cloud import bigquery

RAIZ = Path(__file__).resolve().parents[1]
PASTA_SQL = RAIZ / "sql"
PASTA_SAIDA = RAIZ / "dados" / "brutos"
ESCOPOS = ["https://www.googleapis.com/auth/bigquery"]
# Trava de segurança: a consulta falha em vez de processar (e cobrar) mais que isso.
# A cota gratuita do BigQuery é de 1 TB por mês.
LIMITE_BYTES = 150 * 10**9

CONSULTAS = [
    "01_diretorio_municipios",
    "02_diretorio_cbo",
    "03_diagnostico",
    "04_remuneracao_cbo_niveis",
]


def conectar(projeto):
    credenciais = pydata_google_auth.get_user_credentials(ESCOPOS, use_local_webserver=True)
    return bigquery.Client(project=projeto, credentials=credenciais)


def baixar(job):
    try:
        return job.result().to_arrow(create_bqstorage_client=True)
    except GoogleAPIError as erro:
        print(f"  API de leitura rápida indisponível ({erro.__class__.__name__}); baixando pela API REST")
        return job.result().to_arrow(create_bqstorage_client=False)


def executar(cliente, nome, simular):
    sql = (PASTA_SQL / f"{nome}.sql").read_text(encoding="utf-8")
    simulacao = cliente.query(sql, job_config=bigquery.QueryJobConfig(dry_run=True, use_query_cache=False))
    print(f"[{nome}] vai processar {simulacao.total_bytes_processed / 1e9:.2f} GB")
    if simular:
        return

    inicio = time.time()
    job = cliente.query(sql, job_config=bigquery.QueryJobConfig(maximum_bytes_billed=LIMITE_BYTES))
    tabela = baixar(job)
    PASTA_SAIDA.mkdir(parents=True, exist_ok=True)
    pq.write_table(tabela, PASTA_SAIDA / f"{nome}.parquet", compression="zstd")
    print(f"[{nome}] {tabela.num_rows:,} linhas em {time.time() - inicio:.0f}s "
          f"({job.total_bytes_billed / 1e9:.2f} GB faturados na cota gratuita)")


def main():
    argumentos = sys.argv[1:]
    simular = "--simular" in argumentos
    argumentos = [a for a in argumentos if a != "--simular"]
    if not argumentos:
        sys.exit(__doc__)
    cliente = conectar(argumentos[0])
    for nome in argumentos[1:] or CONSULTAS:
        executar(cliente, nome, simular)


if __name__ == "__main__":
    main()
