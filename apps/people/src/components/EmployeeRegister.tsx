import type { Employee } from '@baseline/domain';

interface Props {
  employees: readonly Employee[];
  query: string;
  onQueryChange: (query: string) => void;
  selectedId?: string;
  disabled: boolean;
  onSelect: (employee: Employee) => void;
}

export function EmployeeRegister({
  employees,
  query,
  onQueryChange,
  selectedId,
  disabled,
  onSelect,
}: Props) {
  return (
    <section
      aria-labelledby="employee-register-heading"
      className="people-register"
    >
      <h2 id="employee-register-heading">Employee register</h2>
      <label htmlFor="employee-search">Search by name or role</label>
      <input
        id="employee-search"
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
      <p role="status">
        {employees.length} {employees.length === 1 ? 'employee' : 'employees'}{' '}
        shown
      </p>
      {employees.length === 0 ? (
        <p>No employees match your search.</p>
      ) : (
        <div className="people-table-scroll">
          <table>
            <caption className="people-visually-hidden">
              Searchable employee register
            </caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Role</th>
                <th scope="col">Hours/week</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr
                  key={employee.id}
                  className={
                    employee.id === selectedId
                      ? 'people-selected-row'
                      : undefined
                  }
                >
                  <th scope="row">
                    <button
                      type="button"
                      aria-pressed={employee.id === selectedId}
                      disabled={disabled}
                      onClick={() => onSelect(employee)}
                    >
                      {employee.name}
                    </button>
                  </th>
                  <td>{employee.role}</td>
                  <td>{employee.weeklyHours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
