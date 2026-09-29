import type { ModelProvider, ModelRequest, ProviderManifest, ReviewModelRequest } from './types.js';

export const SCRIPTED_PROVIDER_MANIFEST: ProviderManifest = Object.freeze({
  provider: 'scripted-offline',
  model: 'fixture-responder',
  version: '1.0.0',
  prompt_versions: { transaction_analyst: 'transaction-analyst/1.0.0', contract_analyst: 'contract-analyst/1.0.0' },
  review_prompt_versions: { evidence_agent: 'evidence-agent/1.0.0', reviewer: 'reviewer/1.0.0' },
  policy_version: 'bounded-analysis-policy/1.0.0',
  temperature: 0,
  seed: 0,
  data_policy: 'Offline scripted fixture; no data leaves the process.',
});

export class ScriptedModelProvider implements ModelProvider {
  readonly calls: (ModelRequest | ReviewModelRequest)[] = [];
  constructor(private readonly responses: unknown[], readonly manifest: ProviderManifest = SCRIPTED_PROVIDER_MANIFEST) {}

  async complete(request: ModelRequest | ReviewModelRequest, signal: AbortSignal): Promise<unknown> {
    if (signal.aborted) throw new Error('MODEL_TIMEOUT');
    this.calls.push(structuredClone(request));
    if (!this.responses.length) throw new Error('MODEL_SCRIPT_EXHAUSTED');
    const next = this.responses.shift();
    return structuredClone(typeof next === 'function' ? next(structuredClone(request)) : next);
  }
}
