/**
 * /auth/login - Login page
 *
 * Local/cloud modes: email/password form beside the sales panel.
 * Demo mode: the shared credentials on a plain card — a demo visitor is
 * already looking, and has nothing to buy.
 * Whitelabel mode: auto-redirects to Auth0 SSO (no form shown).
 */

import { IconBrandGoogle, IconInfoCircle } from "@tabler/icons-react";
import { createFileRoute, Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { MCP_AUTHORIZE_ENDPOINT } from "@workspace/config/constants";
import type { ClientConfig } from "@workspace/config/types";
import { authClient } from "@workspace/lib/auth/client";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Separator } from "@workspace/ui/components/separator";
import { useEffect, useState } from "react";
import { z } from "zod";
import { t } from "@/lib/i18n";
import { AuthSplitLayout } from "@/components/auth/auth-split-layout";
import { SalesFooterLinks, SalesPanel } from "@/components/auth/sales-panel";
import FullPageCard from "@/components/full-page-card";
import { safeReturnTo } from "@/lib/return-to";
import { buildTitle, getAppName } from "@/lib/route-head";

/**
 * When the OAuth plugin sent the browser here mid-flow, handing the signed query
 * back to the authorization endpoint resumes it — including for the paths that
 * leave for an identity provider, where the request is gone on return.
 */
function postSignInDestination(search: LoginSearch): string {
	if (!search.sig) return safeReturnTo(search.returnTo);
	const query = new URLSearchParams(
		Object.entries(search).flatMap(([key, value]) =>
			value === undefined ? [] : [[key, String(value)] as [string, string]],
		),
	);
	return `${MCP_AUTHORIZE_ENDPOINT}?${query}`;
}

/** A passthrough: the plugin signs the whole query, so a dropped parameter is a
 * signature that no longer verifies. */
interface LoginSearch {
	returnTo?: string;
	ref?: string;
	sig?: string;
}

export const Route = createFileRoute("/auth/login")({
	validateSearch: (search: Record<string, unknown>): LoginSearch => search,
	head: ({ match }) => {
		const appName = getAppName(match);
		return {
			meta: [
				{ title: buildTitle(t("auth.login.title"), { appName }) },
				{ name: "description", content: t("auth.login.description") },
			],
		};
	},
	component: LoginPage,
});

function LoginPage() {
	const search = Route.useSearch();
	const { returnTo, ref: incomingRef } = search;
	const destination = postSignInDestination(search);
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const mode = context.clientConfig?.mode;
	const canRegister = context.clientConfig?.canRegister ?? false;
	const hasUsers = context.clientConfig?.hasUsers ?? false;

	if (mode === "whitelabel") {
		return <SSOLogin destination={destination} />;
	}

	if (mode === "demo") {
		return <DemoLogin destination={destination} />;
	}

	if (mode === "local" && !hasUsers) {
		// Render-time redirect must not touch window during SSR; the client pass does it.
		if (typeof window !== "undefined") window.location.href = "/auth/register";
		return null;
	}

	return (
		<EmailPasswordLogin
			destination={destination}
			returnTo={returnTo}
			incomingRef={incomingRef}
			isCloud={mode === "cloud"}
			canRegister={canRegister}
		/>
	);
}

export function SSOLogin({ destination = "/app" }: { destination?: string }) {
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		authClient.signIn
			.sso({ providerId: "auth0-whitelabel", callbackURL: destination })
			.then((result) => {
				if (cancelled) return;
				if (result.error) {
					setError(result.error.message ?? t("auth.login.sso-failed"));
				}
			})
			.catch(() => {
				if (!cancelled) {
					setError(t("auth.login.generic-error"));
				}
			});

		return () => {
			cancelled = true;
		};
	}, [destination]);

	if (error) {
		return (
			<FullPageCard title={t("auth.login.title")}>
				<div className="w-full space-y-4">
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
					<Button className="w-full" onClick={() => window.location.reload()}>
						{t("auth.login.try-again")}
					</Button>
				</div>
			</FullPageCard>
		);
	}

	return <FullPageCard title={t("auth.login.signing-in")} subtitle={t("auth.login.sso-redirecting")} />;
}

export function DemoLogin({ destination = "/app" }: { destination?: string }) {
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setLoading(true);

		try {
			const result = await authClient.signIn.email({ email: "demo@answerecho.com", password: "demo" });
			if (result.error) {
				setError(result.error.message ?? t("auth.login.invalid-credentials"));
				setLoading(false);
				return;
			}
			window.location.href = destination;
		} catch {
			setError(t("auth.login.generic-error"));
			setLoading(false);
		}
	}

	return (
		<FullPageCard title={t("auth.login.title")}>
			<form onSubmit={handleSubmit} className="space-y-4 w-full">
				<DemoCredentialsCallout />
				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
				<Button type="submit" className="w-full" disabled={loading}>
					{loading ? t("auth.login.signing-in") : t("auth.login.title")}
				</Button>
			</form>
		</FullPageCard>
	);
}

export function EmailPasswordLogin({
	destination = "/app",
	returnTo,
	incomingRef,
	isCloud,
	canRegister,
}: {
	destination?: string;
	returnTo?: string;
	incomingRef?: string;
	isCloud?: boolean;
	canRegister?: boolean;
}) {
	const navigate = useNavigate();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const source = isCloud ? "cloud-signin" : "self-hosted-signin";

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setLoading(true);

		try {
			const result = await authClient.signIn.email({
				email,
				password,
			});

			if (result.error) {
				// An expired authorization request; dropping it makes the next attempt
				// an ordinary sign-in.
				if ((result.error as { error?: string }).error === "invalid_signature") {
					// Through the router, so `destination` is recomputed.
					navigate({ to: "/auth/login", search: {}, replace: true });
					setError(t("auth.login.connection-expired"));
					setLoading(false);
					return;
				}
				if (isCloud && result.error.status === 403) {
					setError(t("auth.login.verify-email-first"));
				} else {
					setError(result.error.message ?? t("auth.login.invalid-credentials"));
				}
				setLoading(false);
				return;
			}

			window.location.href = destination;
		} catch {
			setError(t("auth.login.generic-error"));
			setLoading(false);
		}
	}

	return (
		<AuthSplitLayout
			title={t("auth.login.welcome-back")}
			subtitle={isCloud ? t("auth.login.subtitle-cloud") : t("auth.login.subtitle-self-hosted")}
			pitch={<SalesPanel variant={isCloud ? "cloud" : "self-hosted"} source={source} />}
			footer={<SalesFooterLinks source={source} />}
		>
			{isCloud && (
				<div className="space-y-4 w-full pb-4">
					<Button
						type="button"
						variant="outline"
						className="w-full"
						onClick={() => authClient.signIn.social({ provider: "google", callbackURL: destination })}
					>
						<IconBrandGoogle className="size-4" />
						{t("auth.login.continue-with-google")}
					</Button>
					<div className="flex items-center gap-3">
						<Separator className="flex-1" />
						<span className="text-xs text-muted-foreground">{t("auth.login.or")}</span>
						<Separator className="flex-1" />
					</div>
				</div>
			)}
			<form onSubmit={handleSubmit} className="space-y-4 w-full">
				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
				<div className="space-y-2">
					<Label htmlFor="email">{t("auth.login.email-label")}</Label>
					<Input
						id="email"
						type="email"
						placeholder={t("auth.login.email-placeholder")}
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						required
						autoComplete="email"
						autoFocus
					/>
				</div>
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<Label htmlFor="password">{t("auth.login.password-label")}</Label>
						{isCloud && (
							<Link to="/auth/forgot-password" className="text-xs text-primary hover:underline">
								{t("auth.login.forgot-password-link")}
							</Link>
						)}
					</div>
					<Input
						id="password"
						type="password"
						placeholder={t("auth.login.password-label")}
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
						autoComplete="current-password"
					/>
				</div>
				<Button type="submit" className="w-full" disabled={loading}>
					{loading ? t("auth.login.signing-in") : t("auth.login.title")}
				</Button>
			</form>
			{canRegister && (
				<p className="text-sm text-muted-foreground pt-4">
					{t("auth.login.no-account")}{" "}
					<Link
						to="/auth/register"
						search={{ ...(returnTo ? { returnTo } : {}), ...(incomingRef ? { ref: incomingRef } : {}) }}
						className="text-primary hover:underline font-medium"
					>
						{t("auth.login.create-one")}
					</Link>
				</p>
			)}
		</AuthSplitLayout>
	);
}

function DemoCredentialsCallout() {
	return (
		<div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
			<IconInfoCircle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
			<div className="space-y-2">
				<p className="font-medium text-amber-900 dark:text-amber-100">{t("auth.login.demo-account")}</p>
				<dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-amber-900/90 dark:text-amber-100/80">
					<div className="flex items-center gap-1.5">
						<dt className="opacity-70">Email</dt>
						<dd className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-[11px]">demo@answerecho.com</dd>
					</div>
					<div className="flex items-center gap-1.5">
						<dt className="opacity-70">Password</dt>
						<dd className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-[11px]">demo</dd>
					</div>
				</dl>
			</div>
		</div>
	);
}
