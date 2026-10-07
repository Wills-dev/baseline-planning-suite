export type ProjectStatus = 'Planned' | 'InProgress' | 'Closed';

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
}
