/** Reports carry no ids, so a dismissal is keyed by the normalised title. */
export function opportunityKey(title: string): string {
	return title.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}
