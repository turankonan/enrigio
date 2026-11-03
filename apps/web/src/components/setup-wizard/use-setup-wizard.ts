import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getModelMeta } from "@workspace/config/models";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	DEFAULT_ENGINES,
	defaultEngines,
	draftFromSuggestion,
	type SetupDraft,
	type SetupStep,
} from "@/lib/setup-wizard";
import { getLatestFirstScanFn, saveSetupDraftFn, startFirstScanFn } from "@/server/first-scan";
import { getAnalyzeBrandStatusFn, startAnalyzeBrandFn } from "@/server/onboarding";
import { getModelPickerStateFn } from "@/server/platform-picks";

const ANALYSIS_POLL_MS = 2000;
const ANALYSIS_TIMEOUT_MS = 6 * 60 * 1000;
const DRAFT_SAVE_DEBOUNCE_MS = 800;

export interface WizardBrand {
	id: string;
	name: string;
	website: string;
	setupDraft: unknown;
}

export type Phase =
	| { kind: "booting" }
	| { kind: "analyzing"; failed: boolean }
	| { kind: "editing"; draft: SetupDraft }
	| { kind: "scanning"; firstScanId: string };

const isDraft = (v: unknown): v is SetupDraft => !!v && typeof v === "object" && "questions" in v && "engines" in v;

/**
 * Draft persistence with a debounce; a pending save is flushed rather than lost when the wizard unmounts.
 * `stop` holds saves while the first scan starts: its transaction clears the draft, and a late save would
 * write it back.
 */
function useDraftSaver(brandId: string) {
	const [saved, setSaved] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pending = useRef<SetupDraft | null>(null);
	const stopped = useRef(false);

	const flush = useCallback(() => {
		if (timer.current) clearTimeout(timer.current);
		timer.current = null;
		const draft = pending.current;
		pending.current = null;
		if (!draft || stopped.current) return;
		saveSetupDraftFn({ data: { brandId, draft } })
			.then(() => setSaved(true))
			.catch(() => {});
	}, [brandId]);

	const save = useCallback(
		(draft: SetupDraft, immediate = false) => {
			if (stopped.current) return;
			setSaved(false);
			pending.current = draft;
			if (timer.current) clearTimeout(timer.current);
			if (immediate) flush();
			else timer.current = setTimeout(flush, DRAFT_SAVE_DEBOUNCE_MS);
		},
		[flush],
	);

	const stop = useCallback(() => {
		stopped.current = true;
		if (timer.current) clearTimeout(timer.current);
		timer.current = null;
		pending.current = null;
	}, []);

	const resume = useCallback(() => {
		stopped.current = false;
	}, []);

	useEffect(() => flush, [flush]);

	return { saved, save, flush, stop, resume };
}

export function useSetupWizard(brand: WizardBrand) {
	const queryClient = useQueryClient();
	const [phase, setPhase] = useState<Phase>({ kind: "booting" });
	const startedAt = useRef(Date.now());
	const saver = useDraftSaver(brand.id);

	const picker = useQuery({
		queryKey: ["model-picker", brand.id],
		queryFn: () => getModelPickerStateFn({ data: { brandId: brand.id } }),
	});
	const available = useMemo(
		() => (picker.data?.available ?? []).map((o) => ({ model: o.model, label: getModelMeta(o.model).label })),
		[picker.data],
	);
	const engineChoices = useMemo(
		() => (available.length ? available.map((a) => a.model) : DEFAULT_ENGINES),
		[available],
	);

	// Resume a saved draft, then a scan already started elsewhere, before falling back to the analysis.
	useEffect(() => {
		if (phase.kind !== "booting" || picker.isPending) return;
		if (isDraft(brand.setupDraft)) {
			setPhase({ kind: "editing", draft: brand.setupDraft });
			return;
		}
		getLatestFirstScanFn({ data: { brandId: brand.id } })
			.then((scan) =>
				setPhase(scan ? { kind: "scanning", firstScanId: scan.firstScanId } : { kind: "analyzing", failed: false }),
			)
			.catch(() => setPhase({ kind: "analyzing", failed: false }));
	}, [phase.kind, picker.isPending, brand.id, brand.setupDraft]);

	const analyzing = phase.kind === "analyzing" && !phase.failed;
	const analysis = useQuery({
		queryKey: ["analyze-brand", brand.id],
		queryFn: () => getAnalyzeBrandStatusFn({ data: { brandId: brand.id } }),
		enabled: analyzing,
		refetchInterval: (q) =>
			q.state.data?.status === "pending" && Date.now() - startedAt.current < ANALYSIS_TIMEOUT_MS
				? ANALYSIS_POLL_MS
				: false,
	});

	// Polling stops at the timeout, so the screen has to give up on its own rather than spin forever.
	useEffect(() => {
		if (!analyzing) return;
		const remaining = ANALYSIS_TIMEOUT_MS - (Date.now() - startedAt.current);
		const timer = setTimeout(() => setPhase({ kind: "analyzing", failed: true }), Math.max(0, remaining));
		return () => clearTimeout(timer);
	}, [analyzing]);

	useEffect(() => {
		if (analyzing && analysis.isError) setPhase({ kind: "analyzing", failed: true });
	}, [analyzing, analysis.isError]);

	useEffect(() => {
		if (!analyzing || !analysis.data) return;
		if (analysis.data.status === "done") {
			setPhase({ kind: "editing", draft: draftFromSuggestion(analysis.data.suggestion, engineChoices) });
		} else if (analysis.data.status === "failed") {
			setPhase({ kind: "analyzing", failed: true });
		}
	}, [analyzing, analysis.data, engineChoices]);

	// Polling resumes only once the new job exists, or the first poll would read the old failure back.
	const retryAnalysis = () =>
		startAnalyzeBrandFn({ data: { brandId: brand.id, website: brand.website } })
			.then(() => {
				startedAt.current = Date.now();
				queryClient.removeQueries({ queryKey: ["analyze-brand", brand.id] });
				setPhase({ kind: "analyzing", failed: false });
			})
			.catch(() => {});

	const continueByHand = () =>
		setPhase({
			kind: "editing",
			draft: {
				step: 1,
				profile: { name: brand.name, sector: "", location: "", marketKey: null, aliases: [], additionalDomains: [] },
				questions: [],
				rivals: [],
				engines: defaultEngines(engineChoices),
			},
		});

	const update = (draft: SetupDraft) => {
		setPhase({ kind: "editing", draft });
		saver.save(draft);
	};

	const goto = (draft: SetupDraft, step: SetupStep) => {
		const next = { ...draft, step };
		setPhase({ kind: "editing", draft: next });
		saver.save(next, true);
	};

	const start = useMutation({
		mutationFn: (draft: SetupDraft) => startFirstScanFn({ data: { brandId: brand.id, draft } }),
		onMutate: saver.stop,
		// The scan did not start, so the draft is still the brand's only record of the edits.
		onError: (_err, draft) => {
			saver.resume();
			saver.save(draft, true);
		},
		onSuccess: ({ firstScanId }) => setPhase({ kind: "scanning", firstScanId }),
	});

	const continueLater = () => {
		if (phase.kind === "editing") saver.save(phase.draft, true);
	};

	return {
		phase,
		available,
		saved: saver.saved,
		retryAnalysis,
		continueByHand,
		update,
		goto,
		start,
		continueLater,
	};
}
