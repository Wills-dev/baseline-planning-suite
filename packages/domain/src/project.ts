import type { DateOnly } from './date-only.js';

export type ProjectStatus = 'Planned' | 'InProgress' | 'Closed';

export interface Project {
  id: string;
  name: string;
  status?: ProjectStatus;
  startDate?: DateOnly;
  endDate?: DateOnly;
}
