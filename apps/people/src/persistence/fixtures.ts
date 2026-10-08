import type { Employee, RateRecord, WeeklyHours } from '@baseline/domain';

export interface PeopleFixtures {
  employees: Employee[];
  rateRecords: RateRecord[];
}

/** Stable employee-NN IDs also identify the future staffing rows in Delivery fixtures. */
export function createPeopleFixtures(): PeopleFixtures {
  const surnames = [
    'Okafor',
    'Mensah',
    'Adeyemi',
    'Patel',
    'Chen',
    'Garcia',
    'Diallo',
    'Kim',
    'Silva',
    'Brown',
    'Ahmed',
    'Martin',
    'Nwosu',
    'Singh',
    'Wilson',
  ];
  const initials = ['A', 'B', 'C', 'D'];
  const schedules: readonly WeeklyHours[] = [40, 32, 20];
  const roles = [
    'Frontend Engineer',
    'Backend Engineer',
    'Designer',
    'QA Engineer',
    'Delivery Lead',
  ];
  const employees: Employee[] = [];
  const rateRecords: RateRecord[] = [];
  for (let index = 0; index < 60; index++) {
    const id = `employee-${String(index + 1).padStart(2, '0')}`;
    employees.push({
      id,
      name: `${initials[Math.floor(index / surnames.length)]}. ${surnames[index % surnames.length]}`,
      weeklyHours: schedules[index % schedules.length] ?? 40,
      role: roles[index % roles.length] ?? 'Engineer',
    });
    rateRecords.push({
      id: `${id}-rate-1`,
      employeeId: id,
      validFrom: '2025-01-01',
      hourlyCostEUR: 80 + (index % 11),
    });
    rateRecords.push({
      id: `${id}-rate-2`,
      employeeId: id,
      validFrom: `2026-03-${String(12 + (index % 5)).padStart(2, '0')}`,
      hourlyCostEUR: 95 + (index % 11),
    });
    if (index >= 1 && index <= 30) {
      rateRecords.push({
        id: `${id}-rate-3`,
        employeeId: id,
        validFrom: '2026-08-17',
        hourlyCostEUR: 103 + (index % 11),
      });
    }
  }
  return { employees, rateRecords };
}
