import { MARKETING_VERTICAL } from './data/marketing.data';
import { RECRUITING_VERTICAL } from './data/recruiting.data';
import { SALES_VERTICAL } from './data/sales.data';
import { SMALL_BUSINESS_VERTICAL } from './data/small-business.data';
import type { VerticalConfig } from './vertical-config';

export const VERTICALS: readonly VerticalConfig[] = [
  SALES_VERTICAL,
  MARKETING_VERTICAL,
  RECRUITING_VERTICAL,
  SMALL_BUSINESS_VERTICAL,
] as const;
