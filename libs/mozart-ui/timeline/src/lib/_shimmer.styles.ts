// Shared shimmer animation reused by the turn header and any
// timeline item rendered in ACTIVE state. Matches the Claude.ai
// reference (spec §6.1, §A.2). Components include this string in
// their `styles:` array; the keyframe name is namespaced to avoid
// collisions with global CSS.

export const SHIMMER_TEXT_STYLES = `
  @keyframes hlm-timeline-shimmer {
    0%   { background-position: 200% center; }
    100% { background-position: -200% center; }
  }
  .shimmer-text {
    color: transparent;
    background-image: linear-gradient(
      to right,
      var(--muted-foreground) 0%,
      var(--muted-foreground) 30%,
      color-mix(in srgb, var(--foreground) 90%, transparent) 50%,
      var(--muted-foreground) 80%,
      var(--muted-foreground) 100%
    );
    background-size: 400% 100%;
    background-repeat: no-repeat;
    -webkit-background-clip: text;
    background-clip: text;
    animation: hlm-timeline-shimmer 2.25s linear infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .shimmer-text {
      animation: none;
      color: var(--muted-foreground);
      background: none;
      -webkit-background-clip: initial;
      background-clip: initial;
    }
  }
`;
