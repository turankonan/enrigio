import geistMono400 from "virtual:font/geist-mono-400";
import geistSans400 from "virtual:font/geist-sans-400";
import geistSans500 from "virtual:font/geist-sans-500";
import ubuntu700 from "virtual:font/ubuntu-700";
import type { FontLoader } from "@takumi-rs/core";

/** The faces the card renderers use, embedded into the server bundle at build time. */
export const OG_FONTS: FontLoader[] = [
	{ name: "Ubuntu", data: ubuntu700, style: "normal", weight: 700 },
	{ name: "Geist Sans", data: geistSans400, style: "normal", weight: 400 },
	{ name: "Geist Sans", data: geistSans500, style: "normal", weight: 500 },
	{ name: "Geist Mono", data: geistMono400, style: "normal", weight: 400 },
];
