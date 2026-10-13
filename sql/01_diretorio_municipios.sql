-- Diretório de municípios da Base dos Dados: nome, UF e regiões do IBGE.
-- "Região" no painel = Região Geográfica Imediata (IBGE, 2017), a mesma do painel de referência.
SELECT
  id_municipio,
  nome AS municipio,
  sigla_uf,
  id_regiao_imediata,
  nome_regiao_imediata,
  nome_regiao AS grande_regiao
FROM `basedosdados.br_bd_diretorios_brasil.municipio`
