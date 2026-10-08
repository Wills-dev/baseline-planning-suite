import type { RateRecord } from '@baseline/domain';

const eur = new Intl.NumberFormat('en-IE', {
  style: 'currency',
  currency: 'EUR',
});

interface Props {
  rates: readonly RateRecord[];
  disabled: boolean;
  onEdit: (rate: RateRecord) => void;
  onDelete: (rate: RateRecord) => void;
}

export function RateHistory({ rates, disabled, onEdit, onDelete }: Props) {
  return (
    <section aria-labelledby="rate-history-heading">
      <h3 id="rate-history-heading">Rate history</h3>
      <p>
        Effective-from dates are inclusive. Each rate applies until the next
        record.
      </p>
      {rates.length === 0 ? (
        <p>This employee has no rate records. Add their first rate below.</p>
      ) : (
        <div className="people-table-scroll">
          <table>
            <caption className="people-visually-hidden">
              Rates in chronological order
            </caption>
            <thead>
              <tr>
                <th scope="col">Effective from</th>
                <th scope="col">Hourly rate (EUR)</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((rate) => (
                <tr key={rate.id}>
                  <th scope="row">
                    <time dateTime={rate.validFrom}>{rate.validFrom}</time>
                  </th>
                  <td>{eur.format(rate.hourlyCostEUR)} / hour</td>
                  <td>
                    <div className="people-actions">
                      <button
                        type="button"
                        disabled={disabled}
                        aria-label={`Edit rate starting ${rate.validFrom}`}
                        onClick={() => onEdit(rate)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={disabled}
                        aria-label={`Delete rate starting ${rate.validFrom}`}
                        onClick={() => onDelete(rate)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
