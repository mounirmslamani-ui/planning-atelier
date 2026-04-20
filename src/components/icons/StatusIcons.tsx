import React from 'react';

/**
 * Cadenas jaune fermé — utilisé pour signaler un verrouillage manuel
 * (commande ou étape figée). Style proche du visuel fourni : corps jaune
 * avec contour noir et anse noire.
 */
export const YellowLockIcon: React.FC<React.SVGProps<SVGSVGElement>> = ({
  className,
  ...props
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
    {...props}
  >
    {/* Anse */}
    <path
      d="M8 10V7a4 4 0 0 1 8 0v3"
      stroke="#111"
      strokeWidth="2"
      strokeLinecap="round"
      fill="none"
    />
    {/* Corps */}
    <rect
      x="4.5"
      y="10"
      width="15"
      height="11"
      rx="2"
      fill="#FACC15"
      stroke="#111"
      strokeWidth="1.5"
    />
    {/* Trou de serrure */}
    <circle cx="12" cy="14.5" r="1.4" fill="#111" />
    <rect x="11.35" y="14.5" width="1.3" height="3.2" rx="0.4" fill="#111" />
  </svg>
);

/**
 * Triangle d'alerte jaune avec contour noir et point d'exclamation noir.
 * Utilisé pour signaler une commande non ordonnée ou une gamme vide.
 */
export const WarningTriangleIcon: React.FC<React.SVGProps<SVGSVGElement>> = ({
  className,
  ...props
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
    {...props}
  >
    <path
      d="M12 3.2 22 20.5H2L12 3.2Z"
      fill="#FACC15"
      stroke="#111"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <rect x="11.1" y="9.5" width="1.8" height="6" rx="0.6" fill="#111" />
    <circle cx="12" cy="17.6" r="1.05" fill="#111" />
  </svg>
);
