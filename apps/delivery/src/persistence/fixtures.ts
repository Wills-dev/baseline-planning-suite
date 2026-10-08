import type {
  Allocation,
  BreakdownItem,
  Project,
  YearMonth,
} from '@baseline/domain';
import {
  getWorkingDays,
  monthlyCapacityHours,
  personMonthsToHours,
} from '@baseline/domain';

export interface DeliveryFixtures {
  projects: Project[];
  breakdownItems: BreakdownItem[];
  allocations: Allocation[];
}

export const planningMonths: readonly YearMonth[] = Array.from(
  { length: 12 },
  (_, index) => `2026-${String(index + 1).padStart(2, '0')}` as YearMonth,
);

export function createDeliveryFixtures(): DeliveryFixtures {
  const projects: Project[] = [
    {
      id: 'project-atlas',
      name: 'Atlas Customer Portal',
      status: 'InProgress',
    },
    {
      id: 'project-beacon',
      name: 'Beacon Operations Platform',
      status: 'InProgress',
    },
    { id: 'project-cascade', name: 'Cascade Analytics', status: 'Planned' },
    { id: 'project-delta', name: 'Delta Service Migration', status: 'Planned' },
  ];
  const breakdownItems: BreakdownItem[] = [];
  const activitiesByProject: string[][] = [];
  const deliverableNames = [
    'Discovery and Architecture',
    'Product Implementation',
    'Release and Adoption',
  ];
  const packageNames = ['Core Experience', 'Integrations'];
  const activityNames = ['Design and Build', 'Verification and Handover'];
  for (const [projectIndex, project] of projects.entries()) {
    const activityIds: string[] = [];
    for (let deliverable = 0; deliverable < 3; deliverable++) {
      const deliverableId = `${project.id}-d${deliverable + 1}`;
      breakdownItems.push({
        id: deliverableId,
        projectId: project.id,
        type: 'Deliverable',
        name: deliverableNames[deliverable] ?? 'Delivery',
      });
      for (let workPackage = 0; workPackage < 2; workPackage++) {
        const packageId = `${deliverableId}-wp${workPackage + 1}`;
        breakdownItems.push({
          id: packageId,
          projectId: project.id,
          parentId: deliverableId,
          type: 'WorkPackage',
          name: packageNames[workPackage] ?? 'Work',
        });
        // 84 standard items plus six project-specific integration activities = 90.
        const count = projectIndex < 2 && workPackage === 1 ? 3 : 2;
        for (let activity = 0; activity < count; activity++) {
          const activityId = `${packageId}-a${activity + 1}`;
          activityIds.push(activityId);
          breakdownItems.push({
            id: activityId,
            projectId: project.id,
            parentId: packageId,
            type: 'Activity',
            name: activityNames[activity] ?? 'Integration Readiness',
          });
        }
      }
    }
    activitiesByProject.push(activityIds);
  }
  const allocations: Allocation[] = [];
  for (let employeeIndex = 0; employeeIndex < 60; employeeIndex++) {
    const employeeId = `employee-${String(employeeIndex + 1).padStart(2, '0')}`;
    for (const [monthIndex, month] of planningMonths.entries()) {
      const projectIndex = Math.floor(employeeIndex / 15);
      const project = projects[projectIndex];
      const activityIds = activitiesByProject[projectIndex];
      if (!project || !activityIds?.length)
        throw new Error('Fixture project structure is incomplete');
      const activityId =
        activityIds[
          (employeeIndex + Math.floor(monthIndex / 4)) % activityIds.length
        ];
      if (!activityId) throw new Error('Fixture activity is missing');
      // Stable effort profiles; use the domain engine only for the reference and overlap examples.
      let hours = [64, 48, 32][employeeIndex % 3] ?? 64;
      if (employeeIndex === 0)
        hours = personMonthsToHours(
          0.5,
          monthlyCapacityHours(40, getWorkingDays(month).length),
        );
      allocations.push({
        id: `${employeeId}-${month}-${project.id}`,
        projectId: project.id,
        breakdownItemId: activityId,
        employeeId,
        month,
        hours,
      });
    }
  }
  // A. Okafor also spends 0.75 PM on Beacon in March: overlapping assignments for later capacity work.
  const overlapActivity = activitiesByProject[1]?.[0];
  if (!overlapActivity) throw new Error('Overlap activity is missing');
  allocations.push({
    id: 'employee-01-2026-03-project-beacon',
    projectId: 'project-beacon',
    breakdownItemId: overlapActivity,
    employeeId: 'employee-01',
    month: '2026-03',
    hours: personMonthsToHours(
      0.75,
      monthlyCapacityHours(40, getWorkingDays('2026-03').length),
    ),
  });
  return { projects, breakdownItems, allocations };
}
