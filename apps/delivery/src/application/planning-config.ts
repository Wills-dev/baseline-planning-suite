import { planningMonths } from '../../../../fixtures/official-seed';
import type { YearMonth } from '@baseline/domain';

/** Bootstrap configuration; kept separate from owner persistence fixtures. */
export interface PlanningConfiguration {
  planningMonths: readonly YearMonth[];
}
export const bootstrapPlanningConfiguration: PlanningConfiguration = {
  planningMonths,
};
