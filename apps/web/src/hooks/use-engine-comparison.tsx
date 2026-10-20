import { useQuery } from "@tanstack/react-query";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import { getEngineComparisonFn } from "@/server/analysis";

export function useEngineComparison(brandId?: string) {
	const resolvedBrandId = useResolvedBrandId(brandId);
	const query = useQuery({
		queryKey: ["engine-comparison", resolvedBrandId ?? ""],
		queryFn: () =>
			getEngineComparisonFn({
				data: { brandId: resolvedBrandId!, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
			}),
		enabled: !!resolvedBrandId,
		staleTime: 60_000,
	});
	return { data: query.data, isLoading: query.isLoading, error: query.error, refetch: query.refetch };
}
