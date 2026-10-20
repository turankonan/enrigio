import { Link } from "@tanstack/react-router";
import { AdvancedMenu } from "@/components/advanced-menu";
import { BrandStrip, type BrandStripScore } from "@/components/brand-strip";
import { DemoModePill } from "@/components/demo-mode-pill";
import { Logo } from "@/components/logo";
import { NavUser } from "@/components/nav-user";
import type { ShellScope } from "@/lib/shell-scope";

export function TopBar({ scope, scores = {} }: { scope: ShellScope; scores?: Record<string, BrandStripScore> }) {
	return (
		<header className="sticky top-0 z-20 border-b bg-card">
			<div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 px-4 py-2 md:h-16 md:flex-nowrap md:py-0 md:px-6">
				{/* The gate redirects /app straight back, so a link there goes nowhere. */}
				{scope.section === "account" ? (
					<Logo />
				) : (
					<Link to="/app" className="shrink-0">
						<Logo />
					</Link>
				)}
				{scope.organization && (
					<BrandStrip organization={scope.organization} currentBrandId={scope.brand?.id} scores={scores} />
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
