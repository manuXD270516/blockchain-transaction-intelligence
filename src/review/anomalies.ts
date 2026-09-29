import { EVENT_COUNT_RULE } from '../agents/baseline.js';
import { sha256 } from '../fixtures/loader.js';
import { canonical } from '../normalization/evidence.js';
import type { Anomaly, ReviewedClaim } from './types.js';

export interface AnomalyContext { receipt_evidence_id: string | null; receipt_status: string | null }

export function deriveAnomalies(published: readonly ReviewedClaim[], context: AnomalyContext): Anomaly[] {
  const anomalies: Anomaly[] = [];
  for (const claim of published) {
    if (claim.author.role !== 'baseline') continue;
    if (claim.classification === 'OBSERVED' && context.receipt_status === 'reverted'
      && claim.evidence_ids.length === 1 && claim.evidence_ids[0] === context.receipt_evidence_id) {
      anomalies.push(anomaly({ claim_id: claim.claim_id, classification: 'OBSERVED', label: 'receipt_reports_reverted', rule: null,
        limitations: ['The revert cause is unknown without supported trace or error bytes.',
          'A reverted receipt is not evidence of harm or intent.'] }));
    }
    if (claim.classification === 'RULE-BASED' && claim.derivation?.rule === EVENT_COUNT_RULE.id
      && claim.derivation.version === EVENT_COUNT_RULE.version) {
      anomalies.push(anomaly({ claim_id: claim.claim_id, classification: 'RULE-BASED', label: 'event_count_at_or_above_threshold',
        rule: { id: EVENT_COUNT_RULE.id, version: EVENT_COUNT_RULE.version, threshold: EVENT_COUNT_RULE.threshold,
          window: EVENT_COUNT_RULE.window },
        limitations: ['A count threshold does not prove harm, risk, or intent.', 'No population baseline is declared.'] }));
    }
  }
  return anomalies;
}

function anomaly(value: Omit<Anomaly, 'anomaly_id'>): Anomaly {
  return { anomaly_id: sha256(canonical(value)), ...value };
}
