// Arabe en echappements Unicode (ordre logique) -- ne jamais convertir en
// lettres ni reordonner. <Text> + Reem Kufi gere le rendu RTL et la liaison.
export const TERMS = {
  ronda:   { ar: '\u0631\u0646\u062F\u0629', la: 'Ronda' },
  tringa:  { ar: '\u062A\u0631\u064A\u0646\u06AD\u0629', la: 'Tringa' },
  missa:   { ar: '\u0645\u064A\u0633\u0629', la: 'Missa' },
  araWahd: { ar: '\u0622\u0631\u0627\u0020\u0648\u0627\u062D\u062F', la: 'Ara Wahd' },
  araKhamssa: { ar: '\u0622\u0631\u0627\u0020\u062E\u0645\u0633\u0629', la: 'Ara Khamssa' },
  ara7dach: { ar: '\u0622\u0631\u0627\u0020\u062D\u062F\u0627\u0634', la: 'Ara 7dach' },
  mab9ach: { ar: '\u0645\u0627\u0628\u0642\u0627\u0634', la: 'Mab9ach' },
}
