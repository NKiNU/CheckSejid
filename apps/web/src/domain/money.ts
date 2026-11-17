/** FIN-001: amounts are integer minor units (sen). Default currency MYR. */
export type Sen = number;

const AMOUNT = /^\d{1,9}(\.\d{1,2})?$/;

export function parseAmountToSen(input: string): Sen | null {
  const clean = input.trim().replace(/,/g, '').replace(/^RM\s*/i, '');
  if (!AMOUNT.test(clean)) return null;
  const [whole, frac = ''] = clean.split('.');
  const sen = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return sen > 0 ? sen : null;
}

const fmt = new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR', minimumFractionDigits: 2 });

export function formatMYR(sen: Sen): string {
  if (!Number.isInteger(sen)) throw new Error('Amounts must be integer sen');
  return fmt.format(sen / 100).replace(/^RM\s?/, 'RM ').replace(/^-RM\s?/, '-RM ');
}

export function sumSen(values: Sen[]): Sen {
  return values.reduce((a, b) => a + b, 0);
}
