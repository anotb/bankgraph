type LogFields = Record<string, string | number | boolean | null | undefined>;

function write(level: 'info' | 'warn' | 'error', event: string, fields: LogFields): void {
	const record = JSON.stringify({
		...fields,
		level,
		event,
		timestamp: new Date().toISOString()
	});
	if (level === 'error') console.error(record);
	else if (level === 'warn') console.warn(record);
	else console.log(record);
}

export const logInfo = (event: string, fields: LogFields = {}) => write('info', event, fields);
export const logWarn = (event: string, fields: LogFields = {}) => write('warn', event, fields);
export const logError = (event: string, fields: LogFields = {}) => write('error', event, fields);
