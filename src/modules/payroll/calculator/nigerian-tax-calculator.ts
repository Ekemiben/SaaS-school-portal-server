/**
 * Nigerian Statutory Payroll & Tax Calculation Engine
 * 
 * Statutory References:
 * 1. Personal Income Tax Act (PITA 2011 as amended / Finance Acts)
 * 2. Pension Reform Act (PRA 2014) - 8% Employee / 10% Employer on Basic + Housing + Transport (BHT)
 * 3. National Housing Fund (NHF Act) - 2.5% of Monthly Basic Salary
 * 4. National Health Insurance Scheme (NHIS) - 5% of Monthly Basic Salary (optional)
 */

export interface SalaryCalculationInput {
  basicSalary: number;
  housingAllowance?: number;
  transportAllowance?: number;
  otherAllowances?: number;
  bonus?: number;
  customDeductions?: number;
  lifeAssurance?: number;
  isPensionExempt?: boolean;
  isNhfExempt?: boolean;
  isNhisExempt?: boolean;
  isTaxExempt?: boolean;
  customReliefs?: number;
}

export interface TaxBandDetail {
  bandName: string;
  rate: number;
  taxableAmountInBand: number;
  taxAmount: number;
}

export interface NigerianPayrollBreakdown {
  grossSalary: number;
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowances: number;
  bonus: number;
  pensionBase: number;
  pensionEmployee: number;
  pensionEmployer: number;
  nhf: number;
  nhis: number;
  payeTax: number;
  otherDeductions: number;
  totalDeductions: number;
  netSalary: number;
  totalEmployerCost: number;
  annual: {
    annualGross: number;
    craFixed: number;
    craVariable: number;
    craTotal: number;
    annualPension: number;
    annualNhf: number;
    annualNhis: number;
    annualLifeAssurance: number;
    totalReliefs: number;
    taxableIncome: number;
    isMinimumTaxApplied: boolean;
    annualTax: number;
    taxBands: TaxBandDetail[];
  };
}

export class NigerianTaxCalculator {
  // PITA 6-Band Tax Schedule (Annual)
  private static readonly TAX_BANDS = [
    { limit: 300_000, rate: 0.07, name: 'First ₦300,000 @ 7%' },
    { limit: 300_000, rate: 0.11, name: 'Next ₦300,000 @ 11%' },
    { limit: 500_000, rate: 0.15, name: 'Next ₦500,000 @ 15%' },
    { limit: 500_000, rate: 0.19, name: 'Next ₦500,000 @ 19%' },
    { limit: 1_600_000, rate: 0.21, name: 'Next ₦1,600,000 @ 21%' },
    { limit: Infinity, rate: 0.24, name: 'Above ₦3,200,000 @ 24%' },
  ];

  static calculate(input: SalaryCalculationInput): NigerianPayrollBreakdown {
    const basicSalary = this.round(input.basicSalary || 0);
    const housingAllowance = this.round(input.housingAllowance || 0);
    const transportAllowance = this.round(input.transportAllowance || 0);
    const otherAllowances = this.round(input.otherAllowances || 0);
    const bonus = this.round(input.bonus || 0);
    const customDeductions = this.round(input.customDeductions || 0);
    const lifeAssurance = this.round(input.lifeAssurance || 0);

    // 1. Gross Salary
    const grossSalary = this.round(basicSalary + housingAllowance + transportAllowance + otherAllowances + bonus);

    // 2. Pension (PRA 2014): 8% Employee, 10% Employer on Basic + Housing + Transport
    const pensionBase = this.round(basicSalary + housingAllowance + transportAllowance);
    const pensionEmployee = input.isPensionExempt ? 0 : this.round(pensionBase * 0.08);
    const pensionEmployer = input.isPensionExempt ? 0 : this.round(pensionBase * 0.10);

    // 3. National Housing Fund (NHF): 2.5% of Basic Salary
    const nhf = input.isNhfExempt ? 0 : this.round(basicSalary * 0.025);

    // 4. National Health Insurance Scheme (NHIS): 5% of Basic Salary (if enabled)
    const nhis = input.isNhisExempt || input.isNhisExempt === undefined ? 0 : this.round(basicSalary * 0.05);

    // 5. Consolidated Relief Allowance (CRA) & Annual Reliefs
    const annualGross = this.round(grossSalary * 12);
    const craFixed = 200_000;
    const onePercentGross = this.round(0.01 * annualGross);
    const baseCra = Math.max(craFixed, onePercentGross);
    const craVariable = this.round(0.20 * annualGross);
    const craTotal = this.round(baseCra + craVariable);

    const annualPension = this.round(pensionEmployee * 12);
    const annualNhf = this.round(nhf * 12);
    const annualNhis = this.round(nhis * 12);
    const annualLifeAssurance = this.round(lifeAssurance * 12);
    const customReliefs = this.round((input.customReliefs || 0) * 12);

    const totalReliefs = this.round(craTotal + annualPension + annualNhf + annualNhis + annualLifeAssurance + customReliefs);
    const taxableIncome = Math.max(0, this.round(annualGross - totalReliefs));

    // 6. Progressive PAYE Tax Bands (Annual)
    let remainingTaxable = taxableIncome;
    let annualCalculatedTax = 0;
    const taxBands: TaxBandDetail[] = [];

    if (!input.isTaxExempt && taxableIncome > 0) {
      for (const band of this.TAX_BANDS) {
        if (remainingTaxable <= 0) break;
        const taxableInBand = Math.min(remainingTaxable, band.limit);
        const taxInBand = this.round(taxableInBand * band.rate);
        annualCalculatedTax += taxInBand;
        remainingTaxable -= taxableInBand;

        taxBands.push({
          bandName: band.name,
          rate: band.rate,
          taxableAmountInBand: this.round(taxableInBand),
          taxAmount: this.round(taxInBand),
        });
      }
    }

    // 7. Minimum Tax Rule: Minimum tax of 1% of Gross applies if gross > ₦360,000/yr (₦30,000/mo)
    const minimumAnnualTax = annualGross > 360_000 ? this.round(0.01 * annualGross) : 0;
    let isMinimumTaxApplied = false;
    let annualFinalTax = this.round(annualCalculatedTax);

    if (!input.isTaxExempt && annualGross > 360_000 && annualFinalTax < minimumAnnualTax) {
      annualFinalTax = minimumAnnualTax;
      isMinimumTaxApplied = true;
    }

    if (input.isTaxExempt) {
      annualFinalTax = 0;
    }

    const payeTax = this.round(annualFinalTax / 12);

    // 8. Net Salary & Employer Total Cost
    const totalDeductions = this.round(pensionEmployee + nhf + nhis + payeTax + customDeductions);
    const netSalary = this.round(grossSalary - totalDeductions);
    const totalEmployerCost = this.round(grossSalary + pensionEmployer);

    return {
      grossSalary,
      basicSalary,
      housingAllowance,
      transportAllowance,
      otherAllowances,
      bonus,
      pensionBase,
      pensionEmployee,
      pensionEmployer,
      nhf,
      nhis,
      payeTax,
      otherDeductions: customDeductions,
      totalDeductions,
      netSalary,
      totalEmployerCost,
      annual: {
        annualGross,
        craFixed: baseCra,
        craVariable,
        craTotal,
        annualPension,
        annualNhf,
        annualNhis,
        annualLifeAssurance,
        totalReliefs,
        taxableIncome,
        isMinimumTaxApplied,
        annualTax: annualFinalTax,
        taxBands,
      },
    };
  }

  private static round(val: number): number {
    return Math.round((val + Number.EPSILON) * 100) / 100;
  }
}
