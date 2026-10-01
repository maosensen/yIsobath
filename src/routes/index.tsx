import { createFileRoute } from "@tanstack/react-router";
import { Instrument } from "@/instrument/instrument";
import "@fontsource-variable/saira/wdth.css";
import "@fontsource-variable/azeret-mono";
import "@/instrument/instrument.css";

export const Route = createFileRoute("/")({
	component: Home,
});

/**
 * The whole window is the instrument. `.isobath` scopes its palette and type
 * (src/instrument/instrument.css); it is always dark, whatever the app theme.
 */
function Home() {
	return (
		<div className="isobath">
			<Instrument />
		</div>
	);
}
