/** JSON values accepted by WebMCP input schemas and result envelopes. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

interface SchemaMetadata {
	description?: string;
}

export interface TightStringSchema extends SchemaMetadata {
	type: 'string';
	/** Required so an agent cannot send an unbounded string. */
	maxLength: number;
	minLength?: number;
	pattern?: string;
	enum?: readonly string[];
}

export interface TightNumberSchema extends SchemaMetadata {
	type: 'number' | 'integer';
	/** Required so numeric inputs have an explicit domain. */
	minimum: number;
	maximum: number;
}

export interface TightBooleanSchema extends SchemaMetadata {
	type: 'boolean';
}

export interface TightArraySchema extends SchemaMetadata {
	type: 'array';
	items: TightJsonSchema;
	/** Required so an agent cannot send an unbounded collection. */
	maxItems: number;
	minItems?: number;
	uniqueItems?: boolean;
}

export interface TightObjectSchema extends SchemaMetadata {
	type: 'object';
	properties: Record<string, TightJsonSchema>;
	required?: readonly string[];
	/** Required. Web tools should reject fields they did not advertise. */
	additionalProperties: false;
	minProperties?: number;
	maxProperties?: number;
}

export type TightJsonSchema =
	| TightStringSchema
	| TightNumberSchema
	| TightBooleanSchema
	| TightArraySchema
	| TightObjectSchema;

export interface WebMcpToolAnnotations {
	readOnlyHint: boolean;
	untrustedContentHint: boolean;
}

export interface WebMcpControllerResult {
	/** Short, standalone description of what the controller returned. */
	summary: string;
	data?: unknown;
}

export interface WebMcpControllerContext {
	/** The browser-owned execution signal. Pass it through to fetch or other cancellable work. */
	signal: AbortSignal;
	scope: string;
	toolName: string;
}

export type WebMcpToolController<TInput extends Record<string, unknown> = Record<string, unknown>> = (
	input: TInput,
	context: WebMcpControllerContext
) => WebMcpControllerResult | Promise<WebMcpControllerResult>;

/**
 * Route-owned tool definition. `controller` is adapted to the browser's `execute` callback by
 * the host, so route code never needs to construct a native registration object.
 */
export interface WebMcpToolDefinition<
	TInput extends Record<string, unknown> = Record<string, unknown>
> {
	name: string;
	title?: string;
	description: string;
	inputSchema: TightObjectSchema;
	annotations: WebMcpToolAnnotations;
	controller: WebMcpToolController<TInput>;
	/** Optional larger bounded envelope for paged analysis, complete links, or artifact references. */
	maxResultChars?: number;
	/** Optional secure origins for same-tree, cross-origin exposure. */
	exposedTo?: readonly string[];
}

export interface NativeToolExecuteOptions {
	signal: AbortSignal;
}

/** Structural type for the August 2026 imperative WebMCP API. */
export interface NativeModelContextTool {
	name: string;
	title?: string;
	description: string;
	inputSchema: TightObjectSchema;
	annotations: WebMcpToolAnnotations;
	execute(
		input: Record<string, unknown>,
		options: NativeToolExecuteOptions
	): Promise<unknown>;
}

export interface ModelContextRegisterOptions {
	signal?: AbortSignal;
	exposedTo?: readonly string[];
}

/** Only registration is required by this site host. Retrieval and execution are agent concerns. */
export interface ModelContextLike {
	registerTool(tool: NativeModelContextTool, options?: ModelContextRegisterOptions): Promise<void>;
}

export type WebMcpUnavailableReason =
	| 'not-browser'
	| 'insecure-context'
	| 'missing-model-context'
	| 'missing-register-tool'
	| 'model-context-access-failed';

export interface WebMcpFeatureDetection {
	available: boolean;
	reason?: WebMcpUnavailableReason;
	modelContext?: ModelContextLike;
}

export type WebMcpDiagnosticPhase =
	| 'feature'
	| 'sync'
	| 'registration'
	| 'execution'
	| 'cleanup';

export type WebMcpDiagnosticStatus =
	| 'info'
	| 'success'
	| 'failure'
	| 'unavailable'
	| 'cancelled';

export interface WebMcpDiagnosticEvent {
	id: number;
	at: number;
	phase: WebMcpDiagnosticPhase;
	status: WebMcpDiagnosticStatus;
	scope?: string;
	toolName?: string;
	durationMs?: number;
	code?: string;
	message: string;
}

export type WebMcpRegistrationStatus =
	| 'registering'
	| 'registered'
	| 'failed'
	| 'removed';

export interface WebMcpRegistrationDiagnostic {
	scope: string;
	toolName: string;
	status: WebMcpRegistrationStatus;
	registeredAt?: number;
	registrationMs?: number;
	executionCount: number;
	lastExecutionMs?: number;
	lastFailure?: string;
}

export interface WebMcpDiagnosticsSnapshot {
	feature: Omit<WebMcpFeatureDetection, 'modelContext'>;
	updatedAt: number;
	registrations: readonly WebMcpRegistrationDiagnostic[];
	events: readonly WebMcpDiagnosticEvent[];
}

export interface WebMcpSyncOptions {
	signal?: AbortSignal;
}

export interface WebMcpSyncResult {
	available: boolean;
	registered: readonly string[];
	unchanged: readonly string[];
	removed: readonly string[];
	failed: Readonly<Record<string, string>>;
}

export interface WebMcpToolHost {
	syncScope(
		scope: string,
		tools: readonly WebMcpToolDefinition[],
		options?: WebMcpSyncOptions
	): Promise<WebMcpSyncResult>;
	disposeScope(scope: string, reason?: string): void;
	dispose(reason?: string): void;
	getDiagnostics(): WebMcpDiagnosticsSnapshot;
	subscribe(listener: (snapshot: WebMcpDiagnosticsSnapshot) => void): () => void;
}

export interface CreateWebMcpToolHostOptions {
	/** Explicit context for tests or embedded hosts. Otherwise feature-detect on `document`. */
	modelContext?: ModelContextLike | null | (() => ModelContextLike | null | undefined);
	document?: Document;
	maxResultChars?: number;
	now?: () => number;
	maxDiagnosticEvents?: number;
}
