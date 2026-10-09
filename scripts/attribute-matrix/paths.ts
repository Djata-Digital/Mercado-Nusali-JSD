/**
 * FASE 8B — caminhos dos artefatos da matriz.
 * O inventário das 322 categorias é a EVIDÊNCIA da leitura somente-leitura da produção feita na Fase 8A: fica no diretório v1 e é
 * reutilizado (nunca regravado) pelas versões seguintes. Cada versão da matriz grava os próprios artefatos no seu diretório
 * (docs/attribute-matrix/v1 = matriz da Fase 8A, preservada para comparação; v2 = matriz revisada na Fase 8B).
 */
export const INVENTORY_FILE = 'docs/attribute-matrix/v1/categories.inventory.raw.json';
export const outDirFor = (matrixVersion: string) => `docs/attribute-matrix/${matrixVersion.split('-')[0]}`;
