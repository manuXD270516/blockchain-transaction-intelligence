import type { Investigation } from '../adapters/contracts.js';
import { extractTokenEvents } from '../events/extract.js';
import { claim } from './claims.js';
import type { Claim } from './types.js';

const BASELINE_AUTHOR = { role: 'baseline' as const, provider: null, model: null, prompt_version: 'deterministic-baseline/1.0.0' };
export const EVENT_COUNT_RULE = Object.freeze({ id: 'educational-event-count-threshold', version: '1.0.0',
  threshold: 20, window: 'single-transaction-receipt' });

export function buildBaseline(input: Investigation) {
  const extracted = extractTokenEvents(input);
  const normalized = extracted.normalized;
  const evidenceIds = new Set([
    ...normalized.evidence.map(item => item.evidence_id),
    ...extracted.derived_evidence.map(item => item.evidence_id),
  ]);
  const claims: Claim[] = [];
  if (normalized.transaction) {
    const fields = normalized.transaction.fields;
    claims.push(claim({ text: `Transaction ${fields.hash} reports value_wei ${fields.value_wei} from ${fields.from} to ${fields.to ?? 'contract-creation'}.`,
      subject_refs: [normalized.transaction.id], classification: 'OBSERVED',
      evidence_ids: [normalized.transaction.normalization_evidence_id], derivation: null,
      uncertainty: normalized.snapshot ? 'supported' : 'limited',
      limitations: ['Reported transaction fields do not prove economic ownership or intent.'], alternatives: [], author: BASELINE_AUTHOR }));
  }
  if (normalized.receipt) {
    claims.push(claim({ text: `The receipt reports execution status ${normalized.receipt.fields.status}.`,
      subject_refs: [normalized.receipt.id], classification: 'OBSERVED',
      evidence_ids: [normalized.receipt.normalization_evidence_id], derivation: null, uncertainty: 'supported',
      limitations: normalized.receipt.fields.status === 'reverted' ? ['The revert cause is unknown without supported trace or error bytes.'] : [],
      alternatives: [], author: BASELINE_AUTHOR }));
  }
  if (normalized.fees.total_fee_wei !== null && normalized.fees.evidence_ids.total) {
    claims.push(claim({ text: `The deterministic fee rule computes total_fee_wei ${normalized.fees.total_fee_wei}.`,
      subject_refs: normalized.transaction ? [normalized.transaction.id] : [], classification: 'RULE-BASED',
      evidence_ids: [normalized.fees.evidence_ids.total], derivation: { rule: 'ethereum-fee-total', version: '1.0.0' },
      uncertainty: 'supported', limitations: ['The total covers only fee components supported by the current transaction type.'],
      alternatives: [], author: BASELINE_AUTHOR }));
  }
  for (const transfer of extracted.transfers.slice(0, 50)) {
    for (const id of transfer.evidence_ids) evidenceIds.add(id);
    claims.push(claim({ text: `${transfer.standard_candidate} event reports raw_amount ${transfer.raw_amount} from ${transfer.from} to ${transfer.to}.`,
      subject_refs: [transfer.id, transfer.token_address], classification: 'OBSERVED', evidence_ids: transfer.evidence_ids,
      derivation: { rule: 'standard-token-events', version: '1.0.0' }, uncertainty: 'limited',
      limitations: ['Event-reported movement does not prove net balance, ownership, price, intent, or token conformance.'],
      alternatives: [], author: BASELINE_AUTHOR }));
  }
  if (normalized.receipt && extracted.transfers.length >= EVENT_COUNT_RULE.threshold) {
    claims.push(claim({ text: `The educational event-count rule counts ${extracted.transfers.length} standard transfer events in this receipt, at or above threshold ${EVENT_COUNT_RULE.threshold}.`,
      subject_refs: [normalized.receipt.id], classification: 'RULE-BASED',
      evidence_ids: [normalized.receipt.normalization_evidence_id],
      derivation: { rule: EVENT_COUNT_RULE.id, version: EVENT_COUNT_RULE.version }, uncertainty: 'supported',
      limitations: ['A count threshold does not prove harm, risk, or intent.',
        `Window: ${EVENT_COUNT_RULE.window}; no population baseline is declared.`],
      alternatives: [], author: BASELINE_AUTHOR }));
  }
  return { extracted, claims, evidence_ids: evidenceIds,
    complete: normalized.coverage.status === 'complete' && extracted.coverage.status === 'complete',
    warnings: [...new Set([...normalized.warnings, ...extracted.warnings,
      ...(extracted.transfers.length > 50 ? ['BASELINE_TRANSFER_CLAIMS_TRUNCATED'] : [])])].sort() };
}
