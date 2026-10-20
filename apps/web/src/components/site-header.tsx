import { Link } from "@tanstack/react-router";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb";
import { cn } from "@workspace/ui/lib/utils";
import { Fragment } from "react";
import { type Crumb, useBreadcrumbs } from "@/lib/breadcrumbs";
import { t } from "@/lib/i18n";

// `transition-none` overrides the link's own `transition-colors`: the rail and
// the menu take their hover at once, and a crumb easing into one reads as lag.
const CRUMB = "block rounded-md px-2 py-1 leading-tight transition-none";

function CrumbLabel({ crumb }: { crumb: Crumb }) {
	if (!crumb.kind) return <>{crumb.label}</>;

	return (
		<>
			<span className="mb-0.5 block text-[10px] font-medium uppercase leading-none tracking-wider text-muted-foreground/70">
				{t(crumb.kind === "Organization" ? "app-sidebar.organization" : "app-sidebar.brand")}
			</span>
			{crumb.label}
		</>
	);
}

export function SiteHeader() {
	const crumbs = useBreadcrumbs();

	return (
		<header className="bg-background md:sticky md:top-16 z-10 flex h-12 shrink-0 items-center border-b">
			<div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
				<Breadcrumb className="-ml-2">
					<BreadcrumbList className="gap-0.5 sm:gap-1">
						{crumbs.map((crumb, index) => {
							const isLast = index === crumbs.length - 1;
							return (
								<Fragment key={crumb.href}>
									{index > 0 && <BreadcrumbSeparator className="hidden md:block" />}
									<BreadcrumbItem className={isLast ? undefined : "hidden md:block"}>
										{isLast ? (
											<BreadcrumbPage className={CRUMB}>
												<CrumbLabel crumb={crumb} />
											</BreadcrumbPage>
										) : (
											<BreadcrumbLink
												className={cn(CRUMB, "hover:bg-accent hover:text-accent-foreground")}
												render={<Link to={crumb.href} />}
											>
												<CrumbLabel crumb={crumb} />
											</BreadcrumbLink>
										)}
									</BreadcrumbItem>
								</Fragment>
							);
						})}
					</BreadcrumbList>
				</Breadcrumb>
			</div>
		</header>
	);
}
