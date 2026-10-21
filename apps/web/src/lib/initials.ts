export function initials(name: string | undefined, email: string | undefined): string {
	const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
	const source = words.length > 0 ? words.slice(0, 2).map((w) => w[0] ?? "") : [(email ?? "").trim()[0] ?? ""];
	const text = source.join("").toLocaleUpperCase();
	return text || "?";
}
