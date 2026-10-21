import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import { opportunityKey } from "@/lib/opportunity-key";
import { dismissOpportunityFn, getDismissedOpportunitiesFn } from "@/server/opportunity-dismissals-fn";

const dismissalsKey = (brandId: string) => ["opportunity-dismissals", brandId] as const;

export function useDismissedOpportunities(brandId?: string) {
	const resolvedBrandId = useResolvedBrandId(brandId);
	const query = useQuery({
		queryKey: dismissalsKey(resolvedBrandId ?? ""),
		queryFn: () => getDismissedOpportunitiesFn({ data: { brandId: resolvedBrandId! } }),
		enabled: !!resolvedBrandId,
		staleTime: 60_000,
	});
	return { data: query.data, isLoading: query.isLoading };
}

export function useDismissOpportunity(brandId?: string) {
	const resolvedBrandId = useResolvedBrandId(brandId);
	const queryClient = useQueryClient();
	const key = dismissalsKey(resolvedBrandId ?? "");
	return useMutation({
		mutationFn: (title: string) => dismissOpportunityFn({ data: { brandId: resolvedBrandId!, title } }),
		// The row disappears at once; the server list replaces the guess when it lands.
		onMutate: async (title) => {
			await queryClient.cancelQueries({ queryKey: key });
			const previous = queryClient.getQueryData<string[]>(key) ?? [];
			queryClient.setQueryData<string[]>(key, [...previous, opportunityKey(title)]);
			return { previous };
		},
		onError: (_error, _title, context) => {
			if (context) queryClient.setQueryData(key, context.previous);
		},
		onSuccess: (result) => queryClient.setQueryData(key, result.dismissed),
	});
}
