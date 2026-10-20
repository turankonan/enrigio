import { useQuery } from "@tanstack/react-query";
import { getOrgBrandScoresFn, type OrgBrandScore } from "@/server/dashboard";

export const orgBrandScoresKey = (organizationId: string) => ["org-brand-scores", organizationId] as const;

export function useOrgBrandScores(organizationId: string | undefined) {
	const query = useQuery({
		queryKey: orgBrandScoresKey(organizationId ?? ""),
		queryFn: async () => {
			const rows = await getOrgBrandScoresFn({
				data: { organizationId: organizationId!, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
			});
			return Object.fromEntries(rows.map((row) => [row.brandId, row])) as Record<string, OrgBrandScore>;
		},
		enabled: !!organizationId,
		staleTime: 60_000,
		placeholderData: (prev) => prev,
	});
	return { data: query.data, isLoading: query.isLoading, error: query.error };
}
