"use client";

import { MapPin, Navigation } from "@/components/ui/icons";

interface AddressLinkProps {
  address: string;
  className?: string;
  /** Show a separate "Navigate" button alongside the map link */
  showNavigate?: boolean;
}

/**
 * Renders an address as a clickable Google Maps link, with an optional
 * "Navigate" button that opens turn-by-turn directions.
 * No API key required — uses the free Google Maps URL scheme.
 */
export function AddressLink({ address, className, showNavigate = true }: AddressLinkProps) {
  const encoded = encodeURIComponent(address);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encoded}`;
  const navUrl  = `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;

  return (
    <span className={`inline-flex items-start gap-1.5 flex-wrap ${className ?? ""}`}>
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:underline text-inherit"
        title="View on Google Maps"
      >
        {address}
      </a>
      {showNavigate && (
        <a
          href={navUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Get directions"
          className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-400 dark:hover:bg-blue-900 transition-colors shrink-0 mt-0.5"
        >
          <Navigation className="w-2.5 h-2.5" />
          Navigate
        </a>
      )}
    </span>
  );
}

/**
 * Inline map-pin icon link — use inside existing flex rows where you only want
 * the icon and don't want to reflow text.
 */
export function MapPinLink({ address }: { address: string }) {
  const encoded = encodeURIComponent(address);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encoded}`;
  const navUrl  = `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;

  return (
    <>
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        title="View on Google Maps"
        className="text-muted-foreground hover:text-blue-600 transition-colors"
      >
        <MapPin className="w-3.5 h-3.5" />
      </a>
      <a
        href={navUrl}
        target="_blank"
        rel="noopener noreferrer"
        title="Get directions"
        className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-400 dark:hover:bg-blue-900 transition-colors"
      >
        <Navigation className="w-2.5 h-2.5" />
        Navigate
      </a>
    </>
  );
}
