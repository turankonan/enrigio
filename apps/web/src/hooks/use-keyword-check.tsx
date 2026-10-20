import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import { getKeywordCheckFn, requestKeywordCheckFn } from "@/server/keywords-fn";

export const keywordCheckKey = (brandId: string) => ["keyword-check", brandId] as const;

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
		onSuccess: () => queryClient.invalidateQueries({ queryKey: keywordCheckKey(resolvedBrandId ?? "") }),
	});
}
