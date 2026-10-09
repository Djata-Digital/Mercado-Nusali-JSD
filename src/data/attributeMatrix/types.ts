/**
 * FASE 8A — matriz de atributos por categoria (FONTE VERSIONADA, ainda NÃO aplicada em produção).
 *
 * Um plano por categoria (raiz ou subcategoria): o que ela DEFINE, o que SUBSTITUI (override explícito de um atributo herdado) e o que
 * DESATIVA (esconde um atributo herdado só ali). A herança é a do sistema real (attributeDefinitionService): quem está acima define,
 * quem está abaixo herda; redefinir um código já existente num ancestral exige override; irmãs podem repetir o mesmo código.
 *
 * Nada aqui importa o banco: a matriz é dado puro. O validador (scripts/attribute-matrix) e os testes a executam contra o serviço real
 * em Postgres descartável; a aplicação em produção é uma fase própria (8B), com backup, lotes e auditoria.
 */
export type MatrixAttributeType = 'text' | 'number' | 'select' | 'multiselect' | 'boolean';
export type MatrixAttributeRole = 'spec' | 'variant_axis';

export interface MatrixAttribute {
  /** Código estável (a-z, 0-9, "_"), único no contexto (categoria + ancestrais). Nunca um campo geral reservado. */
  code: string;
  /** Nome amigável exibido ao comprador e ao vendedor (português). */
  name: string;
  type: MatrixAttributeType;
  role: MatrixAttributeRole;
  /** Obrigatório para o vendedor (política: poucos, só o que o vendedor realmente sabe). */
  required: boolean;
  unit?: string;
  options?: string[];
  min?: number;
  max?: number;
  /** Casas decimais permitidas (0 = inteiro). */
  decimals?: number;
  maxLength?: number;
  /** Grupo de apresentação na ficha técnica e no formulário. */
  group?: string;
  /** Ordem de exibição (dentro da categoria que define). */
  order: number;
  placeholder?: string;
  help?: string;
  /** Pode virar filtro de busca (select/multiselect/number/boolean). */
  filterable: boolean;
  /**
   * Só para select OBRIGATÓRIO: lista fechada por natureza (ex.: nº de portas, faixa de idade) que dispensa a opção de saída "Outro".
   * Qualquer outro select obrigatório TEM de oferecer uma saída (senão o vendedor cujo produto não está na lista fica sem poder anunciar).
   * Metadado de revisão: não é gravado no banco.
   */
  closed?: boolean;
}

/** Atributo substituído numa subcategoria (mesmo código/tipo/função do herdado; só muda o que está declarado). */
export type MatrixOverride = { code: string } & Partial<Pick<MatrixAttribute, 'name' | 'required' | 'unit' | 'options' | 'min' | 'max' | 'decimals' | 'maxLength' | 'group' | 'order' | 'placeholder' | 'help' | 'filterable'>>;

export interface CategoryPlan {
  /** Slug COMPLETO real da categoria (ex.: "moda-feminina" ou "moda-feminina-vestidos"). */
  slug: string;
  define: MatrixAttribute[];
  override: MatrixOverride[];
  /** Códigos herdados que NÃO se aplicam a esta categoria (override inativo). */
  disable: string[];
  /** Subcategoria deliberadamente sem atributos próprios nem herdados úteis (justificativa). */
  noAttributesReason?: string;
  /** Observação de revisão (limitações, decisões do dono pendentes). */
  note?: string;
}

/** Políticas validadas pelo dry-run (configuráveis). */
export const MATRIX_POLICY = {
  /** Máximo de specs OBRIGATÓRIAS efetivas por categoria (decisão aprovada: até 3). */
  maxRequiredSpecs: 3,
  /** Máximo de eixos obrigatórios (a interface do assistente tem 2 dimensões + eixos "por anúncio"). */
  maxRequiredAxes: 2,
  /** Teto de specs efetivas por categoria (evita dezenas de campos). */
  maxEffectiveSpecs: 10,
  /** Teto de eixos efetivos. */
  maxEffectiveAxes: 3,
  /** Eixos que cabem na matriz Cor × (Tamanho|Capacidade) do assistente sem valor "por anúncio". */
  wizardMatrixAxes: 2,
} as const;
