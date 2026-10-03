export type MaterialShape = 'round' | 'hexagon' | 'square' | 'flat' | 'sheet';

export const SHAPE_OPTIONS: { value: MaterialShape; label: string }[] = [
  { value: 'round', label: 'Rond (diamètre)' },
  { value: 'hexagon', label: 'Hexagone (ouverture sur plats)' },
  { value: 'square', label: 'Carré (côté)' },
  { value: 'flat', label: 'Plat / rectangle (largeur x épaisseur)' },
  { value: 'sheet', label: 'Tôle (épaisseur x largeur x longueur)' },
];

/** Nombres contenus dans un libellé de dimension : "D40" → [40], "30x40" → [30, 40], "2x1000x2000" → [2, 1000, 2000]. */
export const parseDimensionNumbers = (label: string | null | undefined): number[] =>
  (String(label ?? '').match(/\d+(?:[.,]\d+)?/g) || [])
    .map(s => Number(s.replace(',', '.')))
    .filter(n => Number.isFinite(n) && n > 0);

const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 3 });

export interface WeightEstimateInput {
  shape?: string | null;
  dimensionLabel?: string | null;
  /** Quantité saisie sur la ligne (dans l'unité choisie). */
  quantity?: number | null;
  /** Longueur en mm d'UNE unité (mm = 1, m = 1000, barre de 6 m = 6000). Vide pour une unité « feuille ». */
  mmPerUnit?: number | null;
  /** Masse volumique en g/cm3. */
  densityGcm3?: number | null;
}

/**
 * Poids estimé (kg) de la quantité commandée. Renvoie null dès qu'une donnée manque ou n'est pas
 * interprétable : on préfère ne rien afficher plutôt qu'un poids faux.
 * - rond / hexagone / carré / plat : section × longueur (quantité × mmPerUnit) × masse volumique ;
 * - tôle : épaisseur × largeur × longueur d'une feuille × nombre de feuilles × masse volumique.
 */
export function estimateWeightKg(p: WeightEstimateInput): { kg: number; detail: string } | null {
  const { shape, dimensionLabel, quantity, mmPerUnit, densityGcm3 } = p;
  if (!shape || !densityGcm3 || densityGcm3 <= 0 || !quantity || quantity <= 0) return null;
  const n = parseDimensionNumbers(dimensionLabel);

  let volumeMm3: number;
  let shapeText: string;

  if (shape === 'sheet') {
    if (n.length < 3 || mmPerUnit) return null; // la quantité est un nombre de feuilles
    volumeMm3 = n[0] * n[1] * n[2] * quantity;
    shapeText = `${fmt(quantity)} feuille(s) de ${n[0]} × ${n[1]} × ${n[2]} mm`;
  } else {
    if (!mmPerUnit || mmPerUnit <= 0) return null;
    let area: number;
    let section: string;
    switch (shape) {
      case 'round':
        if (n.length < 1) return null;
        area = (Math.PI / 4) * n[0] ** 2;
        section = `Ø${n[0]}`;
        break;
      case 'hexagon':
        if (n.length < 1) return null;
        area = (Math.sqrt(3) / 2) * n[0] ** 2;
        section = `hexagone ${n[0]}`;
        break;
      case 'square':
        if (n.length < 1) return null;
        area = n[0] ** 2;
        section = `carré ${n[0]}`;
        break;
      case 'flat':
        if (n.length < 2) return null;
        area = n[0] * n[1];
        section = `${n[0]} × ${n[1]}`;
        break;
      default:
        return null;
    }
    const lengthMm = quantity * mmPerUnit;
    volumeMm3 = area * lengthMm;
    shapeText = `${section} × ${fmt(lengthMm)} mm`;
  }

  const kg = (volumeMm3 * densityGcm3) / 1e6;
  return { kg, detail: `${shapeText} × ${fmt(densityGcm3)} g/cm³` };
}
