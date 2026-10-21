import { Link } from "@tanstack/react-router";
import { AdvancedMenu } from "@/components/advanced-menu";
import { BrandStrip } from "@/components/brand-strip";
import { DemoModePill } from "@/components/demo-mode-pill";
import { Logo } from "@/components/logo";
import { NavUser } from "@/components/nav-user";
import { useOrgBrandScores } from "@/hooks/use-org-brand-scores";
import type { ShellScope } from "@/lib/shell-scope";

export function TopBar({ scope }: { scope: ShellScope }) {
	const { data: scores } = useOrgBrandScores(scope.organization?.id);
	return (
		<header className="sticky top-0 z-20 border-b bg-card">
			<div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-5 px-4 py-3 md:h-[84px] md:flex-nowrap md:px-6 md:py-0">
				{/* The gate redirects /app straight back, so a link there goes nowhere. */}
				{scope.section === "account" ? (
					<Logo />
				) : (
					<Link to="/app" className="shrink-0">
						<Logo />
					</Link>
				)}
				{scope.organization && (
					<BrandStrip organization={scope.organization} currentBrandId={scope.brand?.id} scores={scores ?? {}} />
				)}
				<div className="ml-auto flex shrink-0 items-center gap-2">
					<DemoModePill />
					<AdvancedMenu scope={scope} />
					<NavUser />
				</div>
			</div>
		</header>
	);
}
