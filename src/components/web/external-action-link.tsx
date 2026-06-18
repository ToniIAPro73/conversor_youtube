"use client";

import { type ReactNode } from "react";

type LinkState = "enabled" | "disabled-unconfigured";

interface ExternalActionLinkProps {
  /** Absolute URL. When empty/undefined the button renders in disabled state. */
  url: string | undefined;
  /** Visible label text. */
  label: string;
  /** Optional accessible label override (falls back to label). */
  ariaLabel?: string;
  /** Tooltip shown in disabled state. */
  disabledTooltip?: string;
  /** Additional class names applied to both states. */
  className?: string;
  /** Optional icon rendered before the label. */
  icon?: ReactNode;
  /** Whether to open in a new tab (default: true when enabled). */
  newTab?: boolean;
}

/**
 * Renders an external link when `url` is set, or a visibly-disabled button
 * when it is not. Never uses href="#".
 */
export function ExternalActionLink({
  url,
  label,
  ariaLabel,
  disabledTooltip,
  className = "",
  icon,
  newTab = true,
}: ExternalActionLinkProps) {
  const state: LinkState = url ? "enabled" : "disabled-unconfigured";

  if (state === "enabled") {
    return (
      <a
        href={url}
        aria-label={ariaLabel ?? label}
        target={newTab ? "_blank" : undefined}
        rel={newTab ? "noopener noreferrer" : undefined}
        className={className}
      >
        {icon}
        {label}
      </a>
    );
  }

  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title={disabledTooltip}
      aria-label={`${ariaLabel ?? label} — ${disabledTooltip ?? "no disponible"}`}
      className={`cursor-not-allowed opacity-50 ${className}`}
    >
      {icon}
      {label}
    </button>
  );
}
