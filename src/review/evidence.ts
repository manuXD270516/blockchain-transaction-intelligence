import type { Investigation } from '../adapters/contracts.js';
import { buildBaseline } from '../agents/baseline.js';
import type { AnalysisDraft, Claim } from '../agents/types.js';
import { sha256 } from '../fixtures/loader.js';
import { canonical } from '../normalization/evidence.js';
import type { EvidenceNode } from '../normalization/evidence.js';
import type { IndexedEvidence } from './types.js';

export class ReviewInputError extends Error {
  constructor(public readonly code: 'DRAFT_INPUT_MISMATCH' | 'INVALID_DRAFT') { super(code); this.name = 'ReviewInputError'; }
}

const HEX64 = /^[0-9a-f]{64}$/;
const EXCERPT_LIMIT = 500;
const ROOT_KINDS = new Set(['rpc_raw', 'fixture_materialized']);

export interface EvidenceIndex {
  baseline: ReturnType<typeof buildBaseline>;
  items: ReadonlyMap<string, IndexedEvidence>;
  snapshot_conflicts: ReadonlySet<string>;
}

export function buildEvidenceIndex(investigation: Investigation, draft: AnalysisDraft): EvidenceIndex {
  const baseline = buildBaseline(investigation);
  if (draft.baseline.bundle_id !== baseline.extracted.normalized.bundle_id
    || draft.baseline.extraction_id !== baseline.extracted.extraction_id
    || draft.manifest.chain_id !== investigation.chain_id) throw new ReviewInputError('DRAFT_INPUT_MISMATCH');
  const nodes = new Map<string, EvidenceNode>();
  for (const node of [...baseline.extracted.normalized.evidence, ...baseline.extracted.derived_evidence]) nodes.set(node.evidence_id, node);
  const verified = new Map<string, boolean>();
  const verify = (id: string, path: Set<string>): boolean => {
    const cached = verified.get(id);
    if (cached !== undefined) return cached;
    const node = nodes.get(id);
    if (!node || path.has(id)) return false;
    const { evidence_id: _, ...body } = node;
    path.add(id);
    const ok = sha256(canonical(body)) === id && (node.parent_evidence_ids.length
      ? node.parent_evidence_ids.every(parent => verify(parent, path)) : ROOT_KINDS.has(node.kind));
    path.delete(id);
    verified.set(id, ok);
    return ok;
  };
  const items = new Map<string, IndexedEvidence>();
  for (const node of nodes.values()) {
    items.set(node.evidence_id, { evidence_id: node.evidence_id, kind: node.kind,
      source: node.source ? `${node.source.provider_id}:${node.source.method}` : node.transformation ?? 'derived',
      parent_evidence_ids: [...node.parent_evidence_ids], transformation: node.transformation, compatibility: null,
      corpus_snapshot_id: null, excerpt: node.value === null ? null : JSON.stringify(node.value).slice(0, EXCERPT_LIMIT),
      dag_verified: verify(node.evidence_id, new Set()) });
  }
  const conflicts = new Set<string>();
  for (const record of draft.manifest.tool_journal) {
    if (record.status !== 'ok' || !record.structured_content) continue;
    const content = record.structured_content;
    const sameSnapshot = consistentSnapshot(content.snapshot, investigation);
    for (const id of stringIds(content.evidence_ids)) {
      if (!sameSnapshot) { conflicts.add(id); continue; }
      if (!items.has(id)) items.set(id, { evidence_id: id, kind: 'tool_envelope', source: `mcp:${record.tool}`,
        parent_evidence_ids: [], transformation: null, compatibility: null, corpus_snapshot_id: null, excerpt: null, dag_verified: false });
    }
    if (!Array.isArray(content.data)) continue;
    for (const item of content.data) {
      if (typeof item !== 'object' || item === null) continue;
      const hit = item as Record<string, unknown>;
      if (typeof hit.chunk_id !== 'string' || !HEX64.test(hit.chunk_id)) continue;
      const compatibility = ['matched', 'generic', 'unknown', 'conflicting'].includes(hit.compatibility as string)
        ? hit.compatibility as IndexedEvidence['compatibility'] : 'unknown';
      items.set(hit.chunk_id, { evidence_id: hit.chunk_id, kind: 'document_span', source: `corpus:${record.tool}`,
        parent_evidence_ids: [], transformation: null, compatibility,
        corpus_snapshot_id: typeof hit.corpus_snapshot_id === 'string' && HEX64.test(hit.corpus_snapshot_id) ? hit.corpus_snapshot_id : null,
        excerpt: typeof hit.excerpt === 'string' ? hit.excerpt.slice(0, EXCERPT_LIMIT) : null, dag_verified: true });
    }
  }
  return { baseline, items, snapshot_conflicts: conflicts };
}

const PROHIBITED = /\b(?:fraud(?:ulent)?|scam(?:mer)?|malicious|criminal|rug ?pull|money laundering|owned by|controlled by|intended to|unusual for this wallet|probability of fraud)\b/i;
const EVENT_OVERREACH = /\b(?:net balance|owns?|ownership|holds?|compliant|conforms?|conformance)\b/i;

export function validateClaim(claim: Claim, index: EvidenceIndex): string[] {
  const codes = new Set<string>();
  const { claim_id: claimId, ...body } = claim;
  let recomputed: string | null = null;
  try { recomputed = sha256(canonical({ ...body, review_status: 'proposed' })); } catch { codes.add('INVALID_CLAIM_JSON'); }
  if (recomputed !== null && recomputed !== claimId) codes.add('CLAIM_ID_MISMATCH');
  if (!claim.evidence_ids.length) codes.add('EMPTY_EVIDENCE');
  if (new Set(claim.evidence_ids).size !== claim.evidence_ids.length) codes.add('DUPLICATE_EVIDENCE');
  const cited = claim.evidence_ids.map(id => index.items.get(id));
  if (claim.evidence_ids.some(id => index.snapshot_conflicts.has(id))) codes.add('SNAPSHOT_CONFLICT');
  if (cited.some(item => item === undefined)) codes.add('UNRESOLVED_EVIDENCE');
  const resolved = cited.filter((item): item is IndexedEvidence => item !== undefined);
  if (resolved.some(item => item.kind !== 'tool_envelope' && !item.dag_verified)) codes.add('EVIDENCE_DAG_INVALID');
  if (resolved.some(item => item.compatibility === 'conflicting')) codes.add('INCOMPATIBLE_DOCUMENT_EVIDENCE');
  if (new Set(resolved.map(item => item.corpus_snapshot_id).filter(id => id !== null)).size > 1) codes.add('MIXED_CORPUS_SNAPSHOTS');
  const fromBaseline = claim.author.role === 'baseline';
  if (fromBaseline === (claim.classification === 'MODEL-INFERRED')) codes.add('CLASS_INCOHERENT');
  if (claim.classification === 'RULE-BASED' && !claim.derivation) codes.add('CLASS_INCOHERENT');
  if (claim.classification === 'OBSERVED' && resolved.some(item => item.kind === 'document_span')) codes.add('CLASS_INCOHERENT');
  if (claim.classification === 'MODEL-INFERRED' && !claim.limitations.length && !claim.alternatives.length) codes.add('MISSING_UNCERTAINTY');
  if (PROHIBITED.test(claim.text)) codes.add('PROHIBITED_ATTRIBUTION');
  if (EVENT_OVERREACH.test(claim.text) && resolved.some(item => item.transformation?.startsWith('standard-token-events'))) {
    codes.add('EVENT_OVERREACH');
  }
  return [...codes].sort();
}

export function hasProhibitedLanguage(text: string): boolean { return PROHIBITED.test(text); }

function consistentSnapshot(snapshot: unknown, investigation: Investigation): boolean {
  if (snapshot === null || snapshot === undefined) return true;
  return typeof snapshot === 'object' && investigation.snapshot !== null
    && (snapshot as Record<string, unknown>).block_hash === investigation.snapshot.block_hash
    && (snapshot as Record<string, unknown>).block_number === investigation.snapshot.block_number;
}

function stringIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && HEX64.test(id)) : [];
}
