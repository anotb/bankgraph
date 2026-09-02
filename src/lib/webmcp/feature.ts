import type { ModelContextLike, WebMcpFeatureDetection } from './types.js';

type DocumentWithModelContext = Document & { modelContext?: ModelContextLike };

/** Detect the imperative API without assuming the experimental property is present or readable. */
export function detectWebMcp(targetDocument?: Document): WebMcpFeatureDetection {
	if (!targetDocument) return { available: false, reason: 'not-browser' };
	if (typeof globalThis.isSecureContext === 'boolean' && !globalThis.isSecureContext) {
		return { available: false, reason: 'insecure-context' };
	}

	let modelContext: ModelContextLike | undefined;
	try {
		modelContext = (targetDocument as DocumentWithModelContext).modelContext;
	} catch {
		return { available: false, reason: 'model-context-access-failed' };
	}
	if (!modelContext) return { available: false, reason: 'missing-model-context' };
	if (typeof modelContext.registerTool !== 'function') {
		return { available: false, reason: 'missing-register-tool' };
	}
	return { available: true, modelContext };
}

export function detectModelContext(modelContext: ModelContextLike | null | undefined): WebMcpFeatureDetection {
	if (!modelContext) return { available: false, reason: 'missing-model-context' };
	if (typeof modelContext.registerTool !== 'function') {
		return { available: false, reason: 'missing-register-tool' };
	}
	return { available: true, modelContext };
}
