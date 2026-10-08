import type { AllocationUnit, YearMonth } from '@baseline/domain';
import {
  getWorkingDays,
  monthlyCapacityHours,
  personMonthsToHours,
  percentToHours,
  hoursToPersonMonths,
  hoursToPercent,
} from '@baseline/domain';
import type { PlanningPerson } from './planning-people';
import { PlanningInputError } from './planning-error';

export type EditableUnit = Exclude<AllocationUnit, 'Cost'>;

function capacity(person: PlanningPerson, month: YearMonth): number {
  return monthlyCapacityHours(person.weeklyHours, getWorkingDays(month).length);
}

export function hoursToDisplay(
  hours: number,
  unit: EditableUnit,
  person: PlanningPerson,
  month: YearMonth,
): number {
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
  if (unit !== 'PM' && unit !== 'Hours' && unit !== 'Percent')
    throw new PlanningInputError(
      'Cost is unavailable until authoritative People rates are connected.',
    );
  const value = Number(input);
  if (!input.trim() || !Number.isFinite(value) || value < 0)
    throw new PlanningInputError(
      'Enter a finite, non-negative allocation value. Use zero to remove an allocation.',
    );
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
