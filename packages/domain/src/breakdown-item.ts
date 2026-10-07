export type BreakdownItemType = 'Deliverable' | 'WorkPackage' | 'Activity';

export interface BreakdownItem {
  id: string;
  projectId: string;
  parentId?: string;
  type: BreakdownItemType;
  name: string;
}
