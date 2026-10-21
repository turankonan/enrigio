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
		// Every save sends the whole list, so saves must land in the order they were made or an older list
		// can overwrite a newer one; a shared scope makes TanStack Query run them one at a time.
		scope: { id: `brand-keywords:${resolvedBrandId ?? ""}` },
		mutationFn: (keywords: string[]) => updateBrandKeywordsFn({ data: { brandId: resolvedBrandId!, keywords } }),
		onSuccess: async (result) => {
			if (result.enqueued) markKeywordCheckQueued(queryClient, resolvedBrandId ?? "");
			// The brand layout loader carries `brand.keywords`; invalidating the router reloads it.
			await router.invalidate();
			await queryClient.invalidateQueries({ queryKey: keywordCheckKey(resolvedBrandId ?? "") });
		},
	});
}
