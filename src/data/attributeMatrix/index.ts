/** FASE 8A — montagem da matriz completa (dado versionado; NÃO é lido por nenhum código de produção). */
import type { CategoryPlan } from './types.js';
import { tecnologiaPlans } from './plans.tecnologia.js';
import { modaPlans } from './plans.moda.js';
import { casaPlans } from './plans.casa.js';
import { consumoPlans } from './plans.consumo.js';

export const MATRIX_VERSION = 'v2-2026-10-08';
export const ALL_PLANS: CategoryPlan[] = [...tecnologiaPlans, ...modaPlans, ...casaPlans, ...consumoPlans];
export * from './types.js';
