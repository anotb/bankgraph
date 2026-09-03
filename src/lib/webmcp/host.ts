import {
	createErrorEnvelope,
	createResultEnvelope,
	MAX_WEBMCP_ENVELOPE_CHARS,
	MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS
} from './envelope.js';
import { detectModelContext, detectWebMcp } from './feature.js';
import { stableToolSignature, validateToolDefinition } from './schema.js';
import { WorkspaceRevisionConflictError } from '$lib/workspace/index.js';
import { staleRevision, WebMcpToolError } from './runtime.js';
import type {
	CreateWebMcpToolHostOptions,
	ModelContextLike,
	NativeModelContextTool,
	WebMcpDiagnosticEvent,
	WebMcpDiagnosticsSnapshot,
	WebMcpFeatureDetection,
	WebMcpRegistrationDiagnostic,
	WebMcpSyncOptions,
	WebMcpSyncResult,
	WebMcpToolDefinition,
	WebMcpToolHost
} from './types.js';

interface ToolRecord {
	scope: string;
	name: string;
	signature: string;
	definition: WebMcpToolDefinition;
	registrationController: AbortController;
	generation: number;
}

interface ScopeState {
	records: Map<string, ToolRecord>;
	generation: number;
	externalSignal?: AbortSignal;
	detachExternalSignal?: () => void;
}

const DEFAULT_MAX_EVENTS = 80;

function defaultNow(): number {
	return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function describeError(error: unknown): string {
	if (error instanceof Error) return error.message || error.name;
	if (error && typeof error === 'object' && 'message' in error) {
		const message = (error as { message?: unknown }).message;
		if (typeof message === 'string' && message) return message;
	}
	return typeof error === 'string' ? error : 'Unknown WebMCP failure';
}

function abortReason(signal: AbortSignal, fallback = 'WebMCP operation cancelled'): unknown {
	if (signal.reason !== undefined) return signal.reason;
	return typeof DOMException === 'function'
		? new DOMException(fallback, 'AbortError')
		: new Error(fallback);
}

function isAbortFailure(error: unknown, signal?: AbortSignal): boolean {
	const errorName =
		error && typeof error === 'object' && 'name' in error
			? (error as { name?: unknown }).name
			: undefined;
	return Boolean(signal?.aborted || errorName === 'AbortError');
}

function publicToolError(error: unknown): WebMcpToolError | null {
	if (error instanceof WebMcpToolError) return error;
	if (error instanceof WorkspaceRevisionConflictError) {
		return staleRevision(error.expected, error.actual);
	}
	return null;
}

function emptyResult(available: boolean): WebMcpSyncResult {
	return { available, registered: [], unchanged: [], removed: [], failed: {} };
}

/**
 * Create a route-scoped imperative WebMCP registry. Registrations are reconciled by public tool
 * shape; an unchanged tool keeps its browser registration while its controller is refreshed.
 */
export function createWebMcpToolHost(
	options: CreateWebMcpToolHostOptions = {}
): WebMcpToolHost {
	const now = options.now ?? defaultNow;
	const maxResultChars = Math.min(
		MAX_WEBMCP_ENVELOPE_CHARS,
		Math.max(180, options.maxResultChars ?? MAX_WEBMCP_ENVELOPE_CHARS)
	);
	const maxEvents = Math.max(10, options.maxDiagnosticEvents ?? DEFAULT_MAX_EVENTS);
	const scopes = new Map<string, ScopeState>();
	const owners = new Map<string, string>();
	const listeners = new Set<(snapshot: WebMcpDiagnosticsSnapshot) => void>();
	const events: WebMcpDiagnosticEvent[] = [];
	const registrations = new Map<string, WebMcpRegistrationDiagnostic>();
	let eventId = 0;
	let disposed = false;
	let operationQueue: Promise<void> = Promise.resolve();
	let feature = resolveFeature();

	function resolveFeature(): WebMcpFeatureDetection {
		if (options.modelContext !== undefined) {
			const explicit =
				typeof options.modelContext === 'function'
					? options.modelContext()
					: options.modelContext;
			return detectModelContext(explicit);
		}
		const target = options.document ?? (typeof document !== 'undefined' ? document : undefined);
		return detectWebMcp(target);
	}

	function registrationKey(scope: string, toolName: string): string {
		return `${scope}\u0000${toolName}`;
	}

	function notify(): void {
		const snapshot = getDiagnostics();
		for (const listener of listeners) listener(snapshot);
	}

	function emit(event: Omit<WebMcpDiagnosticEvent, 'id' | 'at'>): void {
		events.push({ id: ++eventId, at: now(), ...event });
		if (events.length > maxEvents) events.splice(0, events.length - maxEvents);
		notify();
	}

	function setRegistration(
		scope: string,
		toolName: string,
		patch: Partial<WebMcpRegistrationDiagnostic>
	): void {
		const key = registrationKey(scope, toolName);
		const previous = registrations.get(key);
		registrations.set(key, {
			scope,
			toolName,
			status: previous?.status ?? 'registering',
			executionCount: previous?.executionCount ?? 0,
			...previous,
			...patch
		});
	}

	function refreshFeature(): WebMcpFeatureDetection {
		const next = resolveFeature();
		const changed = next.available !== feature.available || next.reason !== feature.reason;
		feature = next;
		if (changed) {
			emit({
				phase: 'feature',
				status: next.available ? 'success' : 'unavailable',
				code: next.reason,
				message: next.available ? 'Imperative WebMCP is available.' : `WebMCP unavailable: ${next.reason}.`
			});
		}
		return next;
	}

	function ensureScope(scope: string): ScopeState {
		let state = scopes.get(scope);
		if (!state) {
			state = { records: new Map(), generation: 0 };
			scopes.set(scope, state);
		}
		return state;
	}

	function bindExternalSignal(scope: string, state: ScopeState, signal?: AbortSignal): boolean {
		if (state.externalSignal === signal) return !signal?.aborted;
		state.detachExternalSignal?.();
		state.externalSignal = signal;
		state.detachExternalSignal = undefined;
		if (!signal) return true;
		if (signal.aborted) {
			disposeScopeInternal(scope, 'route signal already aborted');
			return false;
		}
		const onAbort = () => disposeScopeInternal(scope, 'route signal aborted');
		signal.addEventListener('abort', onAbort, { once: true });
		state.detachExternalSignal = () => signal.removeEventListener('abort', onAbort);
		return true;
	}

	function unregisterRecord(record: ToolRecord, reason: string): void {
		if (!record.registrationController.signal.aborted) {
			record.registrationController.abort(reason);
		}
		if (owners.get(record.name) === record.scope) owners.delete(record.name);
		setRegistration(record.scope, record.name, { status: 'removed' });
		emit({
			phase: 'cleanup',
			status: 'success',
			scope: record.scope,
			toolName: record.name,
			message: `Unregistered ${record.name}: ${reason}.`
		});
	}

	function disposeScopeInternal(scope: string, reason: string): void {
		const state = scopes.get(scope);
		if (!state) return;
		state.generation += 1;
		state.detachExternalSignal?.();
		for (const record of state.records.values()) unregisterRecord(record, reason);
		state.records.clear();
		scopes.delete(scope);
	}

	async function executeRecord(
		record: ToolRecord,
		input: Record<string, unknown>,
		executionSignal: AbortSignal
	): Promise<unknown> {
		const resultBudget = Math.min(
			MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS,
			record.definition.maxResultChars ?? maxResultChars
		);
		const startedAt = now();
		setRegistration(record.scope, record.name, {
			executionCount:
				(registrations.get(registrationKey(record.scope, record.name))?.executionCount ?? 0) + 1
		});
		emit({
			phase: 'execution',
			status: 'info',
			scope: record.scope,
			toolName: record.name,
			message: `Executing ${record.name}.`
		});

		try {
			if (executionSignal.aborted) throw abortReason(executionSignal);
			// Read the record at call time. Idempotent syncs update this controller without registry churn.
			const result = await record.definition.controller(input, {
				signal: executionSignal,
				scope: record.scope,
				toolName: record.name
			});
			if (executionSignal.aborted) throw abortReason(executionSignal);
			const durationMs = now() - startedAt;
			const envelope = createResultEnvelope(result, resultBudget, input);
			if (envelope.ok) {
				setRegistration(record.scope, record.name, { lastExecutionMs: durationMs });
				emit({
					phase: 'execution',
					status: 'success',
					scope: record.scope,
					toolName: record.name,
					durationMs,
					message: `${record.name} completed.`
				});
			} else {
				setRegistration(record.scope, record.name, {
					lastExecutionMs: durationMs,
					lastFailure: envelope.error.message
				});
				emit({
					phase: 'execution',
					status: 'failure',
					scope: record.scope,
					toolName: record.name,
					durationMs,
					code: envelope.error.code,
					message: envelope.error.message
				});
			}
			return envelope;
		} catch (error) {
			const durationMs = now() - startedAt;
			if (isAbortFailure(error, executionSignal)) {
				setRegistration(record.scope, record.name, { lastExecutionMs: durationMs });
				emit({
					phase: 'execution',
					status: 'cancelled',
					scope: record.scope,
					toolName: record.name,
					durationMs,
					code: 'aborted',
					message: `${record.name} was cancelled.`
				});
				throw abortReason(executionSignal);
			}
			const translatedError = publicToolError(error);
			const publicError = translatedError ?? error;
			const message = describeError(publicError);
			setRegistration(record.scope, record.name, {
				lastExecutionMs: durationMs,
				lastFailure: message
			});
			const errorCode = translatedError?.code ?? 'tool_execution_failed';
			emit({
				phase: 'execution',
				status: 'failure',
				scope: record.scope,
				toolName: record.name,
				durationMs,
				code: errorCode,
				message
			});
			// Resolve a canonical error envelope: native callback rejection currently becomes UnknownError.
			return createErrorEnvelope(publicError, {
				code: errorCode,
				retryable: translatedError?.retryable ?? false,
				details: translatedError?.details,
				maxChars: resultBudget
			});
		}
	}

	function nativeTool(record: ToolRecord): NativeModelContextTool {
		const definition = record.definition;
		return {
			name: definition.name,
			title: definition.title,
			description: definition.description,
			inputSchema: definition.inputSchema,
			annotations: { ...definition.annotations },
			execute: (input, executionOptions) => {
				const signal = executionOptions?.signal ?? new AbortController().signal;
				return executeRecord(record, input, signal);
			}
		};
	}

	async function performSync(
		scope: string,
		tools: readonly WebMcpToolDefinition[],
		syncOptions: WebMcpSyncOptions
	): Promise<WebMcpSyncResult> {
		if (disposed) {
			return {
				...emptyResult(false),
				failed: { _host: 'WebMCP host has been disposed' }
			};
		}
		if (!scope.trim()) {
			return { ...emptyResult(false), failed: { _scope: 'scope must not be empty' } };
		}

		const result = {
			available: feature.available,
			registered: [] as string[],
			unchanged: [] as string[],
			removed: [] as string[],
			failed: {} as Record<string, string>
		};
		const duplicateNames = new Set<string>();
		const seen = new Set<string>();
		for (const tool of tools) {
			if (seen.has(tool.name)) duplicateNames.add(tool.name);
			seen.add(tool.name);
			const issues = validateToolDefinition(tool);
			if (issues.length) result.failed[tool.name || '_unnamed'] = issues.join('; ');
		}
		for (const name of duplicateNames) result.failed[name] = 'duplicate tool name in scope';
		for (const tool of tools) {
			const owner = owners.get(tool.name);
			if (owner && owner !== scope) {
				result.failed[tool.name] = `tool name is already owned by scope ${owner}`;
			}
		}
		if (Object.keys(result.failed).length) {
			emit({
				phase: 'sync',
				status: 'failure',
				scope,
				code: duplicateNames.size ? 'duplicate_tool_name' : 'invalid_tool_definition',
				message: `Rejected tool sync for ${scope}: ${Object.keys(result.failed).join(', ')}.`
			});
			return result;
		}

		const state = ensureScope(scope);
		if (!bindExternalSignal(scope, state, syncOptions.signal)) {
			result.failed._scope = 'scope signal is aborted';
			return result;
		}

		const detected = refreshFeature();
		result.available = detected.available;
		if (!detected.available || !detected.modelContext) {
			emit({
				phase: 'sync',
				status: 'unavailable',
				scope,
				code: detected.reason,
				message: 'Skipped tool registration because WebMCP is unavailable.'
			});
			return result;
		}

		const desired = new Map(tools.map((tool) => [tool.name, tool]));
		for (const [name, record] of state.records) {
			const next = desired.get(name);
			if (!next) {
				state.records.delete(name);
				unregisterRecord(record, 'removed from route scope');
				result.removed.push(name);
				continue;
			}
			const signature = stableToolSignature(next);
			if (signature === record.signature) {
				record.definition = next;
				result.unchanged.push(name);
				desired.delete(name);
			} else {
				state.records.delete(name);
				unregisterRecord(record, 'tool definition changed');
				result.removed.push(name);
			}
		}

		const generation = ++state.generation;
		// Native registration is sequential. Preserve catalog order so essential handoff
		// tools become available before the route-specific long tail.
		for (const definition of desired.values()) {
			if (syncOptions.signal?.aborted || scopes.get(scope) !== state) {
				result.failed[definition.name] = 'scope was cancelled during registration';
				break;
			}
			const registrationController = new AbortController();
			const record: ToolRecord = {
				scope,
				name: definition.name,
				signature: stableToolSignature(definition),
				definition,
				registrationController,
				generation
			};
			state.records.set(definition.name, record);
			owners.set(definition.name, scope);
			setRegistration(scope, definition.name, {
				status: 'registering',
				lastFailure: undefined
			});
			const startedAt = now();
			emit({
				phase: 'registration',
				status: 'info',
				scope,
				toolName: definition.name,
				message: `Registering ${definition.name}.`
			});
			try {
				const nativeOptions = definition.exposedTo
					? { signal: registrationController.signal, exposedTo: definition.exposedTo }
					: { signal: registrationController.signal };
				await detected.modelContext.registerTool(nativeTool(record), nativeOptions);
				const durationMs = now() - startedAt;
				if (
					registrationController.signal.aborted ||
					scopes.get(scope) !== state ||
					state.records.get(definition.name) !== record
				) {
					result.failed[definition.name] = 'registration was cancelled';
					continue;
				}
				setRegistration(scope, definition.name, {
					status: 'registered',
					registeredAt: now(),
					registrationMs: durationMs
				});
				result.registered.push(definition.name);
				emit({
					phase: 'registration',
					status: 'success',
					scope,
					toolName: definition.name,
					durationMs,
					message: `Registered ${definition.name}.`
				});
			} catch (error) {
				const durationMs = now() - startedAt;
				if (state.records.get(definition.name) === record) state.records.delete(definition.name);
				if (owners.get(definition.name) === scope) owners.delete(definition.name);
				const cancelled = isAbortFailure(error, registrationController.signal);
				const message = cancelled ? 'registration was cancelled' : describeError(error);
				result.failed[definition.name] = message;
				setRegistration(scope, definition.name, {
					status: 'failed',
					registrationMs: durationMs,
					lastFailure: message
				});
				emit({
					phase: 'registration',
					status: cancelled ? 'cancelled' : 'failure',
					scope,
					toolName: definition.name,
					durationMs,
					code: cancelled ? 'aborted' : 'registration_failed',
					message
				});
			}
		}

		emit({
			phase: 'sync',
			status: Object.keys(result.failed).length ? 'failure' : 'success',
			scope,
			message: `Tool sync complete: ${result.registered.length} registered, ${result.unchanged.length} unchanged, ${result.removed.length} removed.`
		});
		return result;
	}

	function enqueue<T>(operation: () => Promise<T>): Promise<T> {
		const next = operationQueue.then(operation, operation);
		operationQueue = next.then(
			() => undefined,
			() => undefined
		);
		return next;
	}

	function getDiagnostics(): WebMcpDiagnosticsSnapshot {
		return {
			feature: { available: feature.available, reason: feature.reason },
			updatedAt: events.at(-1)?.at ?? now(),
			registrations: [...registrations.values()]
				.map((item) => ({ ...item }))
				.sort((a, b) =>
					a.scope === b.scope
						? a.toolName.localeCompare(b.toolName)
						: a.scope.localeCompare(b.scope)
				),
			events: events.map((event) => ({ ...event }))
		};
	}

	// The initial state is useful even when no route registers tools.
	emit({
		phase: 'feature',
		status: feature.available ? 'success' : 'unavailable',
		code: feature.reason,
		message: feature.available ? 'Imperative WebMCP is available.' : `WebMCP unavailable: ${feature.reason}.`
	});

	return {
		syncScope: (scope, tools, syncOptions = {}) =>
			enqueue(() => performSync(scope, tools, syncOptions)),
		disposeScope(scope, reason = 'scope disposed') {
			disposeScopeInternal(scope, reason);
		},
		dispose(reason = 'host disposed') {
			if (disposed) return;
			disposed = true;
			for (const scope of [...scopes.keys()]) disposeScopeInternal(scope, reason);
			listeners.clear();
		},
		getDiagnostics,
		subscribe(listener) {
			listeners.add(listener);
			listener(getDiagnostics());
			return () => listeners.delete(listener);
		}
	};
}
