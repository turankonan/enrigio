import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import { keywordCheckKey, markKeywordCheckQueued } from "@/hooks/use-keyword-check";
import { updateBrandKeywordsFn } from "@/server/keywords-fn";

export function useUpdateBrandKeywords(brandId?: string) {
	const resolvedBrandId = useResolvedBrandId(brandId);
	const queryClient = useQueryClient();
	const router = useRouter();
	return useMutation({
		mutationFn: (keywords: string[]) => updateBrandKeywordsFn({ data: { brandId: resolvedBrandId!, keywords } }),
		onSuccess: async (result) => {
			if (result.enqueued) markKeywordCheckQueued(queryClient, resolvedBrandId ?? "");
			// The brand layout loader carries `brand.keywords`; invalidating the router reloads it.
			await router.invalidate();
			await queryClient.invalidateQueries({ queryKey: keywordCheckKey(resolvedBrandId ?? "") });
		},
	});
}
