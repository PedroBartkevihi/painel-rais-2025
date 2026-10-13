-- =============================================================================
-- RAIS 2025 · Remuneração por profissão (CBO 2002) em 4 níveis territoriais
-- Fonte: Base dos Dados (basedosdados.br_me_rais.microdados_vinculos)
-- Saída: uma linha por (nível, território, CBO) com QTDE, MEDIA e MEDIANA
-- =============================================================================

WITH vinculos AS (
  -- 1. Vínculos de 2025 que entram no cálculo
  SELECT
    v.sigla_uf,
    m.id_regiao_imediata,
    v.id_municipio,
    v.cbo_2002,
    v.valor_remuneracao_media AS remuneracao
  FROM `basedosdados.br_me_rais.microdados_vinculos` AS v
  JOIN `basedosdados.br_bd_diretorios_brasil.municipio` AS m
    ON m.id_municipio = v.id_municipio                       -- só municípios que existem no diretório do IBGE
  WHERE v.ano = 2025
    AND v.vinculo_ativo_3112 = '1'                           -- estoque de empregos: ativos em 31/12/2025
    AND v.valor_remuneracao_media > 0                        -- descarta quem não teve remuneração no ano
    AND v.cbo_2002 IN (SELECT cbo_2002 FROM `basedosdados.br_bd_diretorios_brasil.cbo_2002`)  -- só CBOs válidos
),

niveis AS (
  -- 2. Replica cada vínculo nos 4 níveis do painel: Brasil, UF, Região imediata e Município.
  --    A mediana não se soma nem sai da média das medianas dos municípios,
  --    então ela precisa ser calculada de novo em cada nível.
  SELECT n.nivel, n.uf, n.id_regiao, n.id_municipio, v.cbo_2002, v.remuneracao
  FROM vinculos AS v
  CROSS JOIN UNNEST([
    STRUCT('BRASIL' AS nivel, CAST(NULL AS STRING) AS uf, CAST(NULL AS STRING) AS id_regiao, CAST(NULL AS STRING) AS id_municipio),
    STRUCT('UF',        v.sigla_uf, NULL,                 NULL),
    STRUCT('REGIAO',    v.sigla_uf, v.id_regiao_imediata, NULL),
    STRUCT('MUNICIPIO', v.sigla_uf, v.id_regiao_imediata, v.id_municipio)
  ]) AS n
),

com_mediana AS (
  -- 3. Mediana exata de cada grupo (função de janela)
  SELECT
    *,
    PERCENTILE_CONT(remuneracao, 0.5)
      OVER (PARTITION BY nivel, uf, id_regiao, id_municipio, cbo_2002) AS mediana
  FROM niveis
)

-- 4. Quantidade de vínculos, remuneração média e mediana de cada grupo
SELECT
  nivel,
  uf,
  id_regiao,
  id_municipio,
  cbo_2002,
  COUNT(*)                     AS qtde,
  ROUND(AVG(remuneracao), 2)   AS media,
  ROUND(ANY_VALUE(mediana), 2) AS mediana
FROM com_mediana
GROUP BY nivel, uf, id_regiao, id_municipio, cbo_2002
