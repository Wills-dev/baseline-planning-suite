import type { AllocationUnit, YearMonth } from '@baseline/domain';
import {
  getWorkingDays,
  monthlyCapacityHours,
  personMonthsToHours,
  percentToHours,
  hoursToPersonMonths,
  hoursToPercent,
  priceAllocation,
  costToHours,
} from '@baseline/domain';
import type { PlanningPerson } from './planning-people';
import { PlanningInputError } from './planning-error';

export type EditableUnit = AllocationUnit;

function capacity(person: PlanningPerson, month: YearMonth): number {
  return monthlyCapacityHours(person.weeklyHours, getWorkingDays(month).length);
}

export function hoursToDisplay(
  hours: number,
  unit: EditableUnit,
  person: PlanningPerson,
  month: YearMonth,
): number {
  if (unit === 'Cost') {
    const priced = priceCellHours(hours, person, month);
    if (priced.costEUR === null)
      throw new PlanningInputError(priced.unavailable);
    return priced.costEUR;
  }
  if (unit === 'PM') return hoursToPersonMonths(hours, capacity(person, month));
  if (unit === 'Percent') return hoursToPercent(hours, capacity(person, month));
  return hours;
}

export function inputToHours(
  input: string,
  unit: EditableUnit,
  person: PlanningPerson,
  month: YearMonth,
): number {
  if (!['PM', 'Hours', 'Percent', 'Cost'].includes(unit))
    throw new PlanningInputError('Choose a supported allocation unit.');
  const value = Number(input);
  if (!input.trim() || !Number.isFinite(value) || value < 0)
    throw new PlanningInputError(
      'Enter a finite, non-negative allocation value. Use zero to remove an allocation.',
    );
  if (unit === 'Cost') {
    if (person.rateDataError)
      throw new PlanningInputError(person.rateDataError);
    try {
      return costToHours(value, person.employeeId, month, person.rates);
    } catch (error) {
      throw new PlanningInputError(
        error instanceof Error
          ? error.message
          : 'Cost unavailable: no applicable rate.',
      );
    }
  }
  const hours =
    unit === 'PM'
      ? personMonthsToHours(value, capacity(person, month))
      : unit === 'Percent'
        ? percentToHours(value, capacity(person, month))
        : value;
  if (!Number.isFinite(hours) || hours < 0)
    throw new PlanningInputError(
      'The converted allocation hours must be finite and non-negative.',
    );
  return hours;
}

export function allocationIdentity(
  projectId: string,
  breakdownItemId: string,
  employeeId: string,
  month: YearMonth,
): string {
  return JSON.stringify([projectId, breakdownItemId, employeeId, month]);
}

export interface CellPrice {
  costEUR: number | null;
  unavailable: string;
  editable: boolean;
}
/** Complete working-day coverage is required; partial pricing is never shown as a full cost. */
export function priceCellHours(
  hours: number,
  person: PlanningPerson,
  month: YearMonth,
): CellPrice {
  if (person.rateDataError)
    return {
      costEUR: null,
      unavailable: person.rateDataError,
      editable: false,
    };
  try {
    const allocation = {
      id: '',
      projectId: '',
      breakdownItemId: '',
      employeeId: person.employeeId,
      month,
      hours,
    };
    const unitPrice = priceAllocation(
      { ...allocation, hours: 1 },
      person.rates,
    );
    if (unitPrice.missingRateDays.length)
      return {
        costEUR: null,
        unavailable: 'Cost unavailable: no applicable rate.',
        editable: false,
      };
    return {
      costEUR: priceAllocation(allocation, person.rates).totalCostEUR,
      unavailable:
        unitPrice.totalCostEUR === 0
          ? 'Cost editing unavailable: monthly rate is zero. Use Hours, PM or % capacity.'
          : '',
      editable: unitPrice.totalCostEUR > 0,
    };
  } catch {
    return {
      costEUR: null,
      unavailable: 'Cost unavailable: invalid rate data.',
      editable: false,
    };
  }
}
