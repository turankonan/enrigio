import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import type { KeywordCheckView } from "@/server/keywords";
import { getKeywordCheckFn, requestKeywordCheckFn } from "@/server/keywords-fn";

export const keywordCheckKey = (brandId: string) => ["keyword-check", brandId] as const;

/** Flips the cached view to running so polling starts before the worker writes its running row. */
export function markKeywordCheckQueued(queryClient: QueryClient, brandId: string) {
	queryClient.setQueryData<KeywordCheckView>(keywordCheckKey(brandId), (prev) =>
		prev ? { ...prev, running: true } : prev,
	);
}

export function useKeywordCheck(brandId?: string) {
	const resolvedBrandId = useResolvedBrandId(brandId);
	const query = useQuery({
		queryKey: keywordCheckKey(resolvedBrandId ?? ""),
		queryFn: () => getKeywordCheckFn({ data: { brandId: resolvedBrandId! } }),
		enabled: !!resolvedBrandId,
		staleTime: 30_000,
		// A running check finishes within a couple of minutes; poll until it lands.
		refetchInterval: (q) => (q.state.data?.running ? 15_000 : false),
	});
	return { data: query.data, isLoading: query.isLoading, error: query.error, refetch: query.refetch };
}

export function useRequestKeywordCheck(brandId?: string) {
	const resolvedBrandId = useResolvedBrandId(brandId);
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => requestKeywordCheckFn({ data: { brandId: resolvedBrandId! } }),
		onSuccess: (result) => {
			if (result.enqueued) markKeywordCheckQueued(queryClient, resolvedBrandId ?? "");
			return queryClient.invalidateQueries({ queryKey: keywordCheckKey(resolvedBrandId ?? "") });
		},
	});
}
