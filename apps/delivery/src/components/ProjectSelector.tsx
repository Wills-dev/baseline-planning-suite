import type { Project } from '@baseline/domain';

export function ProjectSelector({
  projects,
  value,
  disabled,
  onChange,
}: {
  projects: readonly Project[];
  value: string;
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  return (
    <div className="delivery-project-selector">
      <label htmlFor="delivery-project">Project</label>
      <select
        id="delivery-project"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Select a project</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
            {project.status ? ` (${project.status})` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
