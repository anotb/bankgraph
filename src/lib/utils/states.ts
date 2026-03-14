/** US state/territory abbreviation to full name mapping */
export const STATE_NAMES: Record<string, string> = {
	AL: 'Alabama',
	AK: 'Alaska',
	AZ: 'Arizona',
	AR: 'Arkansas',
	AS: 'American Samoa',
	CA: 'California',
	CO: 'Colorado',
	CT: 'Connecticut',
	DE: 'Delaware',
	DC: 'District of Columbia',
	FL: 'Florida',
	GA: 'Georgia',
	GU: 'Guam',
	HI: 'Hawaii',
	ID: 'Idaho',
	IL: 'Illinois',
	IN: 'Indiana',
	IA: 'Iowa',
	KS: 'Kansas',
	KY: 'Kentucky',
	LA: 'Louisiana',
	ME: 'Maine',
	MD: 'Maryland',
	MA: 'Massachusetts',
	MI: 'Michigan',
	MN: 'Minnesota',
	MS: 'Mississippi',
	MO: 'Missouri',
	MT: 'Montana',
	MP: 'Northern Mariana Islands',
	NE: 'Nebraska',
	NV: 'Nevada',
	NH: 'New Hampshire',
	NJ: 'New Jersey',
	NM: 'New Mexico',
	NY: 'New York',
	NC: 'North Carolina',
	ND: 'North Dakota',
	OH: 'Ohio',
	OK: 'Oklahoma',
	OR: 'Oregon',
	PA: 'Pennsylvania',
	PR: 'Puerto Rico',
	RI: 'Rhode Island',
	SC: 'South Carolina',
	SD: 'South Dakota',
	TN: 'Tennessee',
	TX: 'Texas',
	UT: 'Utah',
	VT: 'Vermont',
	VI: 'Virgin Islands',
	VA: 'Virginia',
	WA: 'Washington',
	WV: 'West Virginia',
	WI: 'Wisconsin',
	WY: 'Wyoming'
};

/** Get full state name from abbreviation, falls back to the abbreviation itself */
export function getStateName(abbr: string): string {
	return STATE_NAMES[abbr] ?? abbr;
}

/** State abbreviations sorted alphabetically by full name */
export const STATES_SORTED: string[] = Object.keys(STATE_NAMES).sort(
	(a, b) => STATE_NAMES[a].localeCompare(STATE_NAMES[b])
);
