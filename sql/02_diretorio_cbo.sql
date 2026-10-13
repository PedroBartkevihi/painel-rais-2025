-- Diretório da Classificação Brasileira de Ocupações (CBO 2002): título e grande grupo de cada código.
SELECT
  cbo_2002,
  descricao AS titulo,
  grande_grupo,
  descricao_grande_grupo
FROM `basedosdados.br_bd_diretorios_brasil.cbo_2002`
