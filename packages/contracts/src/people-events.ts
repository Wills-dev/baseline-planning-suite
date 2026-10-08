/** People invalidates an employee's authoritative rate history after it changes.
 * Consumers should obtain the latest rate data before recalculating affected views.
 */
export interface PeopleRateChangedEvent {
  type: 'people.rateChanged';
  payload: {
    employeeId: string;
  };
}
