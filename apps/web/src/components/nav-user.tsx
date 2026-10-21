import {
	ArrowSquareOut,
	ArrowsClockwise,
	Briefcase,
	Check,
	GearSix,
	Plus,
	SignOut,
	Swap,
	User,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { authClient } from "@workspace/lib/auth/client";
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { OrganizationRowIcon } from "@/components/organization-row-icon";
import { useAuth } from "@/hooks/use-auth";
import { useBrandId } from "@/hooks/use-brand-id";
import { useBranding, useDeploymentFeatures } from "@/hooks/use-deployment-features";
import { useOrganizations } from "@/hooks/use-organizations";
import { t } from "@/lib/i18n";
import { initials } from "@/lib/initials";
import { organizationTree } from "@/lib/organizations/tree";
import type { OrganizationSummary } from "@/lib/organizations/types";
import { resetPostHog } from "@/lib/posthog";

const INLINE_ORGANIZATION_LIMIT = 3;

export function NavUser() {
	const { user } = useAuth();
	const branding = useBranding();
	const features = useDeploymentFeatures();

	// NavUser only renders inside _authed routes, which redirect to /auth/login
	// when there's no session — so `user` is always present at this point.
	if (!user) return null;

	const isNameEmailSame = user.name?.trim().toLowerCase() === user.email?.trim().toLowerCase();

	const parentDashboard =
		branding?.parentUrl && branding?.parentName ? { url: branding.parentUrl, name: branding.parentName } : null;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<button
						type="button"
						aria-label={t("nav-user.account-and-organizations")}
						className="flex size-10 items-center justify-center rounded-full border bg-card text-sm font-semibold text-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary data-popup-open:bg-muted"
					/>
				}
			>
				{user.picture ? (
					<Avatar className="size-10 rounded-full">
						<AvatarImage src={user.picture} alt={user.name} />
						<AvatarFallback className="rounded-full bg-card text-primary">
							{initials(user.name, user.email)}
						</AvatarFallback>
					</Avatar>
				) : (
					initials(user.name, user.email)
				)}
			</DropdownMenuTrigger>
			<DropdownMenuContent className="min-w-64 rounded-lg" align="end" sideOffset={8}>
				{/* Base UI wires the label to its group, so it has to sit inside one. */}
				<DropdownMenuGroup>
					<DropdownMenuLabel className="p-0 font-normal">
						<div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
							<Avatar className="h-8 w-8 rounded-lg">
								<AvatarImage src={user.picture} alt={user.name} />
								<AvatarFallback className="rounded-lg bg-primary/10 text-primary">
									<User className="size-4" />
								</AvatarFallback>
							</Avatar>
							<div className="grid flex-1 text-left text-sm leading-tight">
								<span className="truncate font-medium">{user.name}</span>
								<span className="truncate text-xs">{isNameEmailSame ? t("nav-user.your-account") : user.email}</span>
							</div>
						</div>
					</DropdownMenuLabel>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />

				<OrganizationSwitcher />
				{features?.canCreateOrganizations && (
					<>
						<DropdownMenuItem render={<Link to="/app/new" />} className="cursor-pointer">
							<Plus size={24} />
							{t("new_organization.crumb")}
						</DropdownMenuItem>
						<DropdownMenuSeparator />
					</>
				)}

				{parentDashboard && (
					<>
						<DropdownMenuGroup>
							<DropdownMenuItem
								render={<a href={parentDashboard.url} target="_blank" rel="noreferrer" />}
								className="cursor-pointer"
							>
								<ArrowSquareOut size={24} />
								{parentDashboard.name} Dashboard
							</DropdownMenuItem>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
					</>
				)}
				<DropdownMenuItem
					className="cursor-pointer"
					onClick={() => {
						authClient.signOut({
							fetchOptions: {
								onSuccess: () => {
									resetPostHog();
									window.location.href = "/auth/logout";
								},
							},
						});
					}}
				>
					<SignOut size={24} />
					{t("nav-user.log-out")}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function OrganizationSwitcher() {
	const { data: organizations, isLoading, isFetching, error, refetch } = useOrganizations();
	const currentBrandId = useBrandId();

	if (organizations.length > INLINE_ORGANIZATION_LIMIT) {
		return (
			<>
				<DropdownMenuItem render={<Link to="/app" />} className="cursor-pointer">
					<Swap size={24} />
					{t("nav-user.switch-brand")}
				</DropdownMenuItem>
				<DropdownMenuSeparator />
			</>
		);
	}

	return (
		<>
			{organizations.map((organization) => (
				<OrganizationSection key={organization.id} organization={organization} currentBrandId={currentBrandId} />
			))}

			{isLoading && (
				<DropdownMenuItem disabled>
					<span className="text-muted-foreground">{t("nav-user.loading-organizations")}</span>
				</DropdownMenuItem>
			)}
			{error && (
				<DropdownMenuItem
					className="cursor-pointer"
					closeOnClick={false}
					onClick={() => {
						refetch();
					}}
				>
					<ArrowsClockwise size={24} className={isFetching ? "animate-spin" : undefined} />
					{isFetching ? t("nav-user.retrying") : "Couldn't load your organizations — retry"}
				</DropdownMenuItem>
			)}
		</>
	);
}

function OrganizationSection({
	organization,
	currentBrandId,
}: {
	organization: OrganizationSummary;
	currentBrandId: string | undefined;
}) {
	const { heading, children } = organizationTree(organization);

	return (
		<DropdownMenuGroup aria-label={organization.name}>
			<DropdownMenuItem
				render={<Link {...heading.link} />}
				aria-label={heading.ariaLabel}
				className="cursor-pointer font-medium"
			>
				<Briefcase className="size-4 shrink-0 text-muted-foreground" />
				<span className="truncate">{heading.label}</span>
				<span className="ml-auto flex w-7 shrink-0 justify-center">
					<GearSix className="size-4 text-muted-foreground" />
				</span>
			</DropdownMenuItem>

			{children.length > 0 && (
				<div className="mb-2 ml-4 border-l pl-1">
					{children.map((row) => (
						<DropdownMenuItem
							key={row.key}
							render={<Link {...row.link} />}
							className={row.kind === "brand" ? "cursor-pointer" : "cursor-pointer text-muted-foreground"}
						>
							<OrganizationRowIcon row={row} size="xs" />
							<span className="truncate">{row.label}</span>
							{row.kind === "brand" && row.id === currentBrandId && (
								<span className="ml-auto flex w-7 shrink-0 justify-center">
									<Check className="size-3.5" />
								</span>
							)}
						</DropdownMenuItem>
					))}
				</div>
			)}

			<DropdownMenuSeparator />
		</DropdownMenuGroup>
	);
}
