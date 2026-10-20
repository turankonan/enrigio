/**
 * Brand Kit story — previews all Enrigio brand assets in one place.
 *
 * Sections:
 *  1. Logo — text logo ("Enrigio" in Ubuntu) and whitelabel variant
 *  2. Icon — the mark at various sizes (16, 32, 64, 128, 256)
 *  3. Maskable Icon — for adaptive/PWA contexts
 *  4. Color Palette — brand color, theme colors, and chart palette
 */
import type { Meta } from "@storybook/react";
import { DEFAULT_CHART_COLORS } from "@workspace/config/constants";
import { Logo } from "@/components/logo";
import { type ClientConfig, setMockClientConfig } from "./_mocks/config-client";
import { setMockRouteContext } from "./_mocks/tanstack-router";

const BRAND_COLOR = "#39b54a";

const enrigioConfig: ClientConfig = {
	mode: "local",
	features: {
		readOnly: false,
		showOptimizeButton: false,
		canCreateBrands: true,
	},
	branding: {
		name: "Enrigio",
		chartColors: DEFAULT_CHART_COLORS.map((c) => c),
	},
	analytics: {},
};

const whitelabelConfig: ClientConfig = {
	mode: "whitelabel",
	features: {
		readOnly: false,
		showOptimizeButton: true,
		canCreateBrands: false,
	},
	branding: {
		name: "BrandMonitor Pro",
		icon: "https://api.dicebear.com/9.x/shapes/svg?seed=brand",
		parentName: "AgencyCo",
		parentUrl: "https://agency.example.com",
		chartColors: DEFAULT_CHART_COLORS.map((c) => c),
	},
	analytics: {},
};

export default {
	title: "Brand Kit",
} satisfies Meta;

// ---------------------------------------------------------------------------
// Section helpers
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div className="mb-10">
			<h2 className="text-lg font-semibold text-foreground mb-4 border-b pb-2">{title}</h2>
			{children}
		</div>
	);
}

function ColorSwatch({ color, label }: { color: string; label: string }) {
	return (
		<div className="flex flex-col items-center gap-1">
			<div className="w-12 h-12 rounded-lg border shadow-sm" style={{ backgroundColor: color }} />
			<span className="text-xs text-muted-foreground font-mono">{color}</span>
			{label && <span className="text-xs text-muted-foreground">{label}</span>}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** Full Enrigio brand kit — logo, icons, colors, typography */
export const EnrigioBrandKit = () => {
	setMockClientConfig(enrigioConfig);
	setMockRouteContext({ clientConfig: enrigioConfig });

	const iconSizes = [16, 32, 64, 128, 256];

	return (
		<div className="p-8 max-w-4xl mx-auto space-y-2">
			<h1 className="text-2xl font-bold text-foreground mb-8">Enrigio Brand Kit</h1>

			{/* Logo */}
			<Section title="Logo">
				<div className="flex items-center gap-8">
					<div className="flex flex-col items-center gap-2">
						<div className="bg-background border rounded-lg p-6">
							<Logo />
						</div>
						<span className="text-xs text-muted-foreground">Light background</span>
					</div>
					<div className="flex flex-col items-center gap-2">
						<div className="bg-gray-900 rounded-lg p-6">
							<Logo />
						</div>
						<span className="text-xs text-muted-foreground">Dark background</span>
					</div>
				</div>
			</Section>

			{/* Standard Icon */}
			<Section title="Icon — Standard">
				<div className="space-y-4">
					<div>
						<h3 className="text-sm font-medium mb-3">Light background</h3>
						<div className="flex items-end gap-6 flex-wrap">
							{iconSizes.map((size) => (
								<div key={size} className="flex flex-col items-center gap-2">
									<div
										className="border rounded-lg p-2 bg-background flex items-center justify-center"
										style={{ minWidth: Math.max(size + 16, 48), minHeight: Math.max(size + 16, 48) }}
									>
										<img
											src="/icons/enrigio-icon.svg"
											alt={`Enrigio icon ${size}px`}
											width={size}
											height={size}
											style={{ width: size, height: size }}
										/>
									</div>
									<span className="text-xs text-muted-foreground font-mono">
										{size}×{size}
									</span>
								</div>
							))}
						</div>
					</div>
					<div>
						<h3 className="text-sm font-medium mb-3">Dark background</h3>
						<div className="flex items-end gap-6 flex-wrap">
							{iconSizes.map((size) => (
								<div key={size} className="flex flex-col items-center gap-2">
									<div
										className="rounded-lg p-2 bg-gray-900 flex items-center justify-center"
										style={{ minWidth: Math.max(size + 16, 48), minHeight: Math.max(size + 16, 48) }}
									>
										<img
											src="/icons/enrigio-icon.svg"
											alt={`Enrigio icon ${size}px on dark`}
											width={size}
											height={size}
											style={{ width: size, height: size }}
										/>
									</div>
									<span className="text-xs text-muted-foreground font-mono">
										{size}×{size}
									</span>
								</div>
							))}
						</div>
					</div>
				</div>
			</Section>

			{/* Maskable Icon */}
			<Section title="Icon — Maskable (PWA)">
				<div className="flex items-end gap-6 flex-wrap">
					{[64, 128, 256].map((size) => (
						<div key={size} className="flex flex-col items-center gap-2">
							<div className="border rounded-lg overflow-hidden flex items-center justify-center">
								<img
									src="/icons/enrigio-icon-maskable.svg"
									alt={`Enrigio maskable icon ${size}px`}
									width={size}
									height={size}
									style={{ width: size, height: size }}
								/>
							</div>
							<span className="text-xs text-muted-foreground font-mono">
								{size}×{size}
							</span>
						</div>
					))}
					<div className="flex flex-col items-center gap-2">
						<div
							className="border rounded-full overflow-hidden flex items-center justify-center"
							style={{ width: 128, height: 128 }}
						>
							<img
								src="/icons/enrigio-icon-maskable.svg"
								alt="Enrigio maskable icon circular crop"
								width={128}
								height={128}
								style={{ width: 128, height: 128 }}
							/>
						</div>
						<span className="text-xs text-muted-foreground">Circular crop</span>
					</div>
				</div>
			</Section>

			{/* Colors */}
			<Section title="Brand Colors">
				<div className="flex gap-6 flex-wrap">
					<ColorSwatch color="#39b54a" label="Rigosis Green" />
					<ColorSwatch color="#277a33" label="Action Green" />
					<ColorSwatch color="#4ade80" label="Dark-Mode Green" />
					<ColorSwatch color="#32373c" label="Ink" />
					<ColorSwatch color="#1f7a3d" label="Chart Green" />
				</div>
			</Section>

			{/* Chart Palette */}
			<Section title="Chart Color Palette">
				<div className="flex flex-wrap gap-2">
					{DEFAULT_CHART_COLORS.map((color, i) => (
						<div key={color} className="flex flex-col items-center gap-1">
							<div className="w-8 h-8 rounded border shadow-sm" style={{ backgroundColor: color }} />
							<span className="text-[10px] text-muted-foreground font-mono">{i + 1}</span>
						</div>
					))}
				</div>
			</Section>
		</div>
	);
};

/** Whitelabel brand preview — shows how custom branding appears */
export const WhitelabelBrandPreview = () => {
	setMockClientConfig(whitelabelConfig);
	setMockRouteContext({ clientConfig: whitelabelConfig });

	return (
		<div className="p-8 max-w-4xl mx-auto space-y-2">
			<h1 className="text-2xl font-bold text-foreground mb-8">Whitelabel Brand Preview</h1>

			<Section title="Logo">
				<div className="flex items-center gap-8">
					<div className="flex flex-col items-center gap-2">
						<div className="bg-background border rounded-lg p-6">
							<Logo />
						</div>
						<span className="text-xs text-muted-foreground">Light background</span>
					</div>
					<div className="flex flex-col items-center gap-2">
						<div className="bg-gray-900 rounded-lg p-6">
							<Logo textClassName="text-gray-100" />
						</div>
						<span className="text-xs text-muted-foreground">Dark background</span>
					</div>
				</div>
			</Section>

			<Section title="Icon (128×128)">
				<div className="flex items-center gap-4">
					<div className="border rounded-lg p-2 bg-background">
						<img
							src={whitelabelConfig.branding.icon}
							alt="Whitelabel icon"
							width={128}
							height={128}
							style={{ width: 128, height: 128 }}
						/>
					</div>
					<div className="text-sm text-muted-foreground">
						<p>Single icon at 128×128 from environment variable.</p>
						<p className="font-mono text-xs mt-1">VITE_APP_ICON={whitelabelConfig.branding.icon}</p>
					</div>
				</div>
			</Section>

			<Section title="Branding Details">
				<div className="grid grid-cols-2 gap-4 text-sm">
					<div>
						<span className="text-muted-foreground">Name:</span>
						<span className="ml-2 font-medium">{whitelabelConfig.branding.name}</span>
					</div>
					<div>
						<span className="text-muted-foreground">Parent:</span>
						<span className="ml-2 font-medium">{whitelabelConfig.branding.parentName}</span>
					</div>
					<div>
						<span className="text-muted-foreground">Parent URL:</span>
						<span className="ml-2 font-mono text-xs">{whitelabelConfig.branding.parentUrl}</span>
					</div>
				</div>
			</Section>
		</div>
	);
};
