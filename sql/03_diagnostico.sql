-- Funil do tratamento: quantos vínculos de 2025 existem, quantos entram no cálculo e por que os outros saem.
WITH vinculos AS (
  SELECT
    vinculo_ativo_3112 = '1'     AS ativo_3112,
    valor_remuneracao_media      AS remuneracao,
    IFNULL(id_municipio IN (SELECT id_municipio FROM `basedosdados.br_bd_diretorios_brasil.municipio`), FALSE) AS municipio_valido,
    IFNULL(cbo_2002 IN (SELECT cbo_2002 FROM `basedosdados.br_bd_diretorios_brasil.cbo_2002`), FALSE)         AS cbo_valido
  FROM `basedosdados.br_me_rais.microdados_vinculos`
  WHERE ano = 2025
)
SELECT
  COUNT(*)                                                                    AS vinculos_2025,
  COUNTIF(ativo_3112)                                                         AS ativos_3112,
  COUNTIF(ativo_3112 AND IFNULL(remuneracao, 0) <= 0)                         AS descartados_sem_remuneracao,
  COUNTIF(ativo_3112 AND remuneracao > 0 AND NOT municipio_valido)            AS descartados_municipio_invalido,
  COUNTIF(ativo_3112 AND remuneracao > 0 AND municipio_valido AND NOT cbo_valido) AS descartados_cbo_invalido,
  COUNTIF(ativo_3112 AND remuneracao > 0 AND municipio_valido AND cbo_valido) AS universo_final,
  MIN(IF(ativo_3112 AND remuneracao > 0 AND municipio_valido AND cbo_valido, remuneracao, NULL)) AS remuneracao_minima,
  MAX(IF(ativo_3112 AND remuneracao > 0 AND municipio_valido AND cbo_valido, remuneracao, NULL)) AS remuneracao_maxima,
  AVG(IF(ativo_3112 AND remuneracao > 0 AND municipio_valido AND cbo_valido, remuneracao, NULL)) AS remuneracao_media,
  APPROX_QUANTILES(IF(ativo_3112 AND remuneracao > 0 AND municipio_valido AND cbo_valido, remuneracao, NULL), 100) AS percentis
FROM vinculos
