/**
 * AMC Factsheet Registry — URL templates and metadata for top 15 Indian AMCs.
 */

const AMC_REGISTRY = [
  {
    code: 'HDFC',
    name: 'HDFC Mutual Fund',
    slug: 'hdfc',
    urlTemplate: (month, year) =>
      `https://www.hdfcfund.com/content/dam/abc/india/assets/literature/factsheets/monthly-factsheet-${month}-${year}.pdf`,
    pageUrl: 'https://www.hdfcfund.com/literature/factsheets',
  },
  {
    code: 'ICICI_PRU',
    name: 'ICICI Prudential Mutual Fund',
    slug: 'icici-prudential',
    urlTemplate: (month, year) =>
      `https://www.icicipruamc.com/docs/default-source/default-document-library/factsheet-${month}-${year}.pdf`,
    pageUrl: 'https://www.icicipruamc.com/mutual-fund/factsheets',
  },
  {
    code: 'SBI',
    name: 'SBI Mutual Fund',
    slug: 'sbi',
    urlTemplate: (month, year) =>
      `https://www.sbimf.com/content/dam/sbimf/pdf/factsheets/factsheet-${month}-${year}.pdf`,
    pageUrl: 'https://www.sbimf.com/en/information-center/factsheets',
  },
  {
    code: 'KOTAK',
    name: 'Kotak Mutual Fund',
    slug: 'kotak',
    urlTemplate: (month, year) =>
      `https://www.kotakmf.com/content/dam/kotakmf/pdf/factsheets/factsheet-${month}-${year}.pdf`,
    pageUrl: 'https://www.kotakmf.com/information-center/factsheet',
  },
  {
    code: 'AXIS',
    name: 'Axis Mutual Fund',
    slug: 'axis',
    urlTemplate: (month, year) =>
      `https://www.axismf.com/assets/pdf/factsheets/factsheet-${month}-${year}.pdf`,
    pageUrl: 'https://www.axismf.com/mutual-fund-factsheets',
  },
  {
    code: 'NIPPON',
    name: 'Nippon India Mutual Fund',
    slug: 'nippon',
    urlTemplate: (month, year) =>
      `https://mf.nipponindiaim.com/InvestorServices/Pages/factsheets/Nippon-India-Factsheet-${month}-${year}.pdf`,
    pageUrl: 'https://mf.nipponindiaim.com/investor-services/factsheets',
  },
  {
    code: 'ADITYA_BIRLA',
    name: 'Aditya Birla Sun Life Mutual Fund',
    slug: 'aditya-birla',
    urlTemplate: (month, year) =>
      `https://mutualfund.adityabirlacapital.com/content/dam/abc/india/assets/literature/factsheets/monthly-factsheet-${month}-${year}.pdf`,
    pageUrl: 'https://mutualfund.adityabirlacapital.com/research-and-insights/factsheets',
  },
  {
    code: 'UTI',
    name: 'UTI Mutual Fund',
    slug: 'uti',
    urlTemplate: (month, year) =>
      `https://www.utimf.com/content/dam/utimf/pdf/factsheets/factsheet-${month}-${year}.pdf`,
    pageUrl: 'https://www.utimf.com/forms-and-downloads/factsheets',
  },
  {
    code: 'DSP',
    name: 'DSP Mutual Fund',
    slug: 'dsp',
    urlTemplate: (month, year) =>
      `https://www.dspim.com/content/dam/dsp/pdf/factsheets/factsheet-${month}-${year}.pdf`,
    pageUrl: 'https://www.dspim.com/investor-education/factsheets',
  },
  {
    code: 'TATA',
    name: 'Tata Mutual Fund',
    slug: 'tata',
    urlTemplate: (month, year) =>
      `https://www.tatamutualfund.com/content/dam/tatamf/pdf/factsheets/factsheet-${month}-${year}.pdf`,
    pageUrl: 'https://www.tatamutualfund.com/information-center/factsheets',
  },
  {
    code: 'HSBC',
    name: 'HSBC Mutual Fund',
    slug: 'hsbc',
    urlTemplate: (month, year) =>
      `https://www.assetmanagement.hsbc.co.in/content/dam/hsbc/in/factsheets/factsheet-${month}-${year}.pdf`,
    pageUrl: 'https://www.assetmanagement.hsbc.co.in/en/mutual-funds/investor-resources',
  },
  {
    code: 'INVESCO',
    name: 'Invesco Mutual Fund',
    slug: 'invesco',
    urlTemplate: (month, year) =>
      `https://www.invescomutualfund.com/content/dam/invesco/pdf/factsheets/factsheet-${month}-${year}.pdf`,
    pageUrl: 'https://www.invescomutualfund.com/literature',
  },
  {
    code: 'MIRAE',
    name: 'Mirae Asset Mutual Fund',
    slug: 'mirae',
    urlTemplate: (month, year) =>
      `https://www.miraeassetmf.co.in/content/dam/mirae/pdf/factsheets/factsheet-${month}-${year}.pdf`,
    pageUrl: 'https://www.miraeassetmf.co.in/investor-education/factsheets',
  },
  {
    code: 'MOTILAL',
    name: 'Motilal Oswal Mutual Fund',
    slug: 'motilal-oswal',
    urlTemplate: (month, year) =>
      `https://www.motilaloswalmf.com/content/dam/motilal/pdf/factsheets/factsheet-${month}-${year}.pdf`,
    pageUrl: 'https://www.motilaloswalmf.com/mutual-fund/factsheets',
  },
  {
    code: 'PGIM',
    name: 'PGIM India Mutual Fund',
    slug: 'pgim',
    urlTemplate: (month, year) =>
      `https://www.pgimindiamf.com/content/dam/pgim/pdf/factsheets/factsheet-${month}-${year}.pdf`,
    pageUrl: 'https://www.pgimindiamf.com/statutory-disclosures/factsheets',
  },
]

export function getAmcList() {
  return AMC_REGISTRY
}

export function getAmcByCode(code) {
  return AMC_REGISTRY.find(a => a.code === code) || null
}

/**
 * Returns the current factsheet month in 'month-year' format
 * e.g., 'february-2026'. Factsheets are typically published
 * for the previous month, so we use last month.
 */
export function getCurrentFactsheetMonth() {
  const now = new Date()
  // Use previous month (factsheets lag by ~1 month)
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const months = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
  ]
  return {
    monthName: months[d.getMonth()],
    year: String(d.getFullYear()),
    yyyymm: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
  }
}

/**
 * Build the factsheet URL for a given AMC and month.
 */
export function buildFactsheetUrl(amcCode, monthName, year) {
  const amc = getAmcByCode(amcCode)
  if (!amc) return null
  return amc.urlTemplate(monthName, year)
}
