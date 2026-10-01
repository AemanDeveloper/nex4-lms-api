import { IsIn } from 'class-validator';

export class CreateCheckoutDto {
  @IsIn(['STARTER', 'GROWTH', 'ENTERPRISE'])
  plan!: 'STARTER' | 'GROWTH' | 'ENTERPRISE';

  @IsIn(['MYR', 'USD'])
  currency!: 'MYR' | 'USD';

  @IsIn(['MONTHLY', 'ANNUAL'])
  interval!: 'MONTHLY' | 'ANNUAL';
}

