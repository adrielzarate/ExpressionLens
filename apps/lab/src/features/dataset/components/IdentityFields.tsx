import { expressionLabels } from '../types/dataset'
import type { SampleIdentity } from '../types/dataset'

export function IdentityFields({
  value,
  onChange,
  realOnly = false,
  showParticipant = true,
}: {
  value: SampleIdentity
  onChange: (value: SampleIdentity) => void
  realOnly?: boolean
  showParticipant?: boolean
}) {
  return (
    <div className={`dataset-fields ${!showParticipant ? 'automatic-identities' : ''}`}>
      {showParticipant && (
        <label>
          Participant ID
          <input
            required
            maxLength={200}
            autoComplete="off"
            value={value.participantId}
            placeholder="e.g. person-001"
            onChange={(event) => onChange({ ...value, participantId: event.target.value })}
          />
        </label>
      )}
      <label>
        Expression
        <select
          value={value.label}
          onChange={(event) =>
            onChange({ ...value, label: event.target.value as SampleIdentity['label'] })
          }
        >
          {expressionLabels.map((label) => (
            <option key={label}>{label}</option>
          ))}
        </select>
      </label>
      {!realOnly && (
        <label>
          Source
          <select
            value={value.source}
            onChange={(event) =>
              onChange({ ...value, source: event.target.value as SampleIdentity['source'] })
            }
          >
            <option value="synthetic">Synthetic</option>
            <option value="real">Real</option>
          </select>
        </label>
      )}
    </div>
  )
}
