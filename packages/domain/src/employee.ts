export type WeeklyHours = 20 | 32 | 40;

export interface Employee {
  id: string;
  name: string;
  weeklyHours: WeeklyHours;
  role: string;
}
