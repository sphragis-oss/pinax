const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="The Helm">
  <title>The Helm</title>
  <rect x="4" y="8" width="56" height="48" rx="4" ry="4" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>
  <line x1="4" y1="18" x2="60" y2="18" stroke="currentColor" stroke-opacity="0.35" stroke-width="2"/>
  <circle cx="9.5" cy="13" r="1.4" fill="currentColor"/>
  <circle cx="14.5" cy="13" r="1.4" fill="currentColor" fill-opacity="0.6"/>
  <circle cx="19.5" cy="13" r="1.4" fill="currentColor" fill-opacity="0.3"/>
  <polyline points="11,30 17,36 11,42" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
  <polyline points="22,38 28,38 31,30 35,46 39,34 43,38 50,38" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="51" y="33" width="6" height="10" rx="1" fill="currentColor"/>
</svg>`;

export function appendLogo(parent: HTMLElement, cls = "cc-logo"): SVGSVGElement {
  const doc = new DOMParser().parseFromString(LOGO_SVG, "image/svg+xml");
  const svg = doc.documentElement as unknown as SVGSVGElement;
  svg.classList.add(cls);
  parent.appendChild(svg);
  return svg;
}
