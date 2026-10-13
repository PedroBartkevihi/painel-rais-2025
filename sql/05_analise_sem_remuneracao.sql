-- Análise de apoio: quem são os vínculos ativos em 31/12/2025 sem remuneração no ano?
-- Serve para justificar o filtro "valor_remuneracao_media > 0" da consulta principal.
WITH sem_remuneracao AS (
  SELECT
    valor_remuneracao_media IS NULL AS remuneracao_nula,
    mes_admissao = 12              AS admitido_em_dezembro,
    quantidade_dias_afastamento > 0 AS teve_afastamento,
    tipo_vinculo,
    natureza_juridica
  FROM `basedosdados.br_me_rais.microdados_vinculos`
  WHERE ano = 2025
    AND vinculo_ativo_3112 = '1'
    AND IFNULL(valor_remuneracao_media, 0) <= 0
)
SELECT 'total' AS recorte, '' AS categoria, COUNT(*) AS vinculos FROM sem_remuneracao
UNION ALL
SELECT 'remuneracao_nula', CAST(remuneracao_nula AS STRING), COUNT(*) FROM sem_remuneracao GROUP BY 2
UNION ALL
SELECT 'admitido_em_dezembro', CAST(admitido_em_dezembro AS STRING), COUNT(*) FROM sem_remuneracao GROUP BY 2
UNION ALL
SELECT 'teve_afastamento', CAST(teve_afastamento AS STRING), COUNT(*) FROM sem_remuneracao GROUP BY 2
UNION ALL
SELECT 'tipo_vinculo', tipo_vinculo, COUNT(*) FROM sem_remuneracao GROUP BY 2
UNION ALL
SELECT 'natureza_juridica', natureza_juridica, COUNT(*) FROM sem_remuneracao GROUP BY 2
