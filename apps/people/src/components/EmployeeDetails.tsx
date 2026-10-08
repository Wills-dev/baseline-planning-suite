import type { Employee } from '@baseline/domain';

export function EmployeeDetails({ employee }: { employee: Employee }) {
  return (
    <>
      <h2 id="employee-details-heading">{employee.name}</h2>
      <dl className="people-details">
        <dt>Role</dt>
        <dd>{employee.role}</dd>
        <dt>Weekly hours</dt>
        <dd>{employee.weeklyHours} hours</dd>
      </dl>
    </>
  );
}
