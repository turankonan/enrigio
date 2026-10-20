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
			<div className="mx-auto flex min-h-16 max-w-7xl items-center gap-4 px-4 md:px-6">
				<Link to="/app" className="shrink-0">
					<Logo />
				</Link>
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
