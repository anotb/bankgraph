import type { TightJsonSchema, WebMcpToolDefinition } from './types.js';
import {
	MAX_WEBMCP_ENVELOPE_CHARS,
	MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS
} from './envelope.js';

const TOOL_NAME = /^[A-Za-z0-9_.-]{1,128}$/;
const MAX_SCHEMA_DEPTH = 5;
// A single semantic editor is easier for an agent to discover and invoke than a
// family of narrowly overlapping tools. Keep the schema bounded, but allow the
// complete board-view editor to describe every supported exact setting.
const MAX_PROPERTIES = 32;
const MAX_SCHEMA_CHARS = 8_000;
const MAX_STRING_LENGTH = 4_096;
const MAX_ARRAY_ITEMS = 250;

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function validateSchemaNode(schema: TightJsonSchema, path: string, depth: number, issues: string[]): void {
	if (!schema || typeof schema !== 'object') {
		issues.push(`${path} must be a schema object`);
		return;
	}

	if (depth > MAX_SCHEMA_DEPTH) {
		issues.push(`${path} exceeds the maximum schema depth of ${MAX_SCHEMA_DEPTH}`);
		return;
	}

	if (schema.description !== undefined && schema.description.length > 240) {
		issues.push(`${path}.description must be 240 characters or fewer`);
	}

	switch (schema.type) {
		case 'object': {
			if (schema.additionalProperties !== false) {
				issues.push(`${path}.additionalProperties must be false`);
			}
			if (!schema.properties || typeof schema.properties !== 'object' || Array.isArray(schema.properties)) {
				issues.push(`${path}.properties must be an object`);
				return;
			}
			const keys = Object.keys(schema.properties);
			if (keys.length > MAX_PROPERTIES) {
				issues.push(`${path} has more than ${MAX_PROPERTIES} properties`);
			}
			if (
				schema.minProperties !== undefined &&
				(!Number.isInteger(schema.minProperties) ||
					schema.minProperties < 0 ||
					schema.minProperties > keys.length)
			) {
				issues.push(`${path}.minProperties must be an integer from 0 to ${keys.length}`);
			}
			if (
				schema.maxProperties !== undefined &&
				(!Number.isInteger(schema.maxProperties) ||
					schema.maxProperties < 0 ||
					schema.maxProperties > MAX_PROPERTIES ||
					(schema.minProperties !== undefined && schema.maxProperties < schema.minProperties))
			) {
				issues.push(`${path}.maxProperties must be an integer from minProperties to ${MAX_PROPERTIES}`);
			}
			const required = schema.required ?? [];
			if (new Set(required).size !== required.length) {
				issues.push(`${path}.required contains duplicate names`);
			}
			for (const requiredName of required) {
				if (!Object.hasOwn(schema.properties, requiredName)) {
					issues.push(`${path}.required references unknown property ${requiredName}`);
				}
			}
			for (const key of keys) {
				validateSchemaNode(schema.properties[key], `${path}.properties.${key}`, depth + 1, issues);
			}
			return;
		}
		case 'array':
			if (
				!Number.isInteger(schema.maxItems) ||
				schema.maxItems < 0 ||
				schema.maxItems > MAX_ARRAY_ITEMS
			) {
				issues.push(`${path}.maxItems must be an integer from 0 to ${MAX_ARRAY_ITEMS}`);
			}
			if (
				schema.minItems !== undefined &&
				(!Number.isInteger(schema.minItems) ||
					schema.minItems < 0 ||
					schema.minItems > schema.maxItems)
			) {
				issues.push(`${path}.minItems must be an integer no greater than maxItems`);
			}
			validateSchemaNode(schema.items, `${path}.items`, depth + 1, issues);
			return;
		case 'string':
			if (
				!Number.isInteger(schema.maxLength) ||
				schema.maxLength < 1 ||
				schema.maxLength > MAX_STRING_LENGTH
			) {
				issues.push(`${path}.maxLength must be an integer from 1 to ${MAX_STRING_LENGTH}`);
			}
			if (
				schema.minLength !== undefined &&
				(!Number.isInteger(schema.minLength) ||
					schema.minLength < 0 ||
					schema.minLength > schema.maxLength)
			) {
				issues.push(`${path}.minLength must be an integer no greater than maxLength`);
			}
			if (schema.enum && (schema.enum.length === 0 || schema.enum.length > 50)) {
				issues.push(`${path}.enum must contain between 1 and 50 values`);
			}
			return;
		case 'integer':
		case 'number':
			if (!isFiniteNumber(schema.minimum) || !isFiniteNumber(schema.maximum)) {
				issues.push(`${path} requires finite minimum and maximum values`);
			} else if (schema.minimum > schema.maximum) {
				issues.push(`${path}.minimum must not exceed maximum`);
			}
			return;
		case 'boolean':
			return;
		default:
			issues.push(`${path}.type is not supported by the bounded schema subset`);
	}
}

export function validateToolDefinition(tool: WebMcpToolDefinition): readonly string[] {
	const issues: string[] = [];
	if (!TOOL_NAME.test(tool.name)) {
		issues.push('name must be 1-128 ASCII letters, digits, underscores, hyphens, or periods');
	}
	if (!tool.description.trim() || tool.description.length > 600) {
		issues.push('description must be 1-600 characters');
	}
	if (tool.title !== undefined && (!tool.title.trim() || tool.title.length > 120)) {
		issues.push('title must be 1-120 characters when provided');
	}
	if (typeof tool.controller !== 'function') {
		issues.push('controller must be a function');
	}
	if (
		!tool.annotations ||
		typeof tool.annotations.readOnlyHint !== 'boolean' ||
		typeof tool.annotations.untrustedContentHint !== 'boolean'
	) {
		issues.push('annotations must explicitly set readOnlyHint and untrustedContentHint');
	}
	if (
		tool.maxResultChars !== undefined &&
		(!Number.isSafeInteger(tool.maxResultChars) ||
			tool.maxResultChars < MAX_WEBMCP_ENVELOPE_CHARS ||
			tool.maxResultChars > MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS)
	) {
		issues.push(
			`maxResultChars must be an integer from ${MAX_WEBMCP_ENVELOPE_CHARS} to ${MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS}`
		);
	}
	validateSchemaNode(tool.inputSchema, 'inputSchema', 0, issues);
	try {
		if (JSON.stringify(tool.inputSchema).length > MAX_SCHEMA_CHARS) {
			issues.push(`inputSchema must serialize to ${MAX_SCHEMA_CHARS} characters or fewer`);
		}
	} catch {
		issues.push('inputSchema must be JSON serializable');
	}
	return issues;
}

export function stableToolSignature(tool: WebMcpToolDefinition): string {
	return stableStringify({
		name: tool.name,
		title: tool.title,
		description: tool.description,
		inputSchema: tool.inputSchema,
		annotations: tool.annotations,
		maxResultChars: tool.maxResultChars,
		exposedTo: tool.exposedTo ? [...tool.exposedTo].sort() : undefined
	});
}

function stableStringify(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
	if (value && typeof value === 'object') {
		return `{${Object.entries(value as Record<string, unknown>)
			.filter(([, child]) => child !== undefined)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
			.join(',')}}`;
	}
	return JSON.stringify(value);
}
