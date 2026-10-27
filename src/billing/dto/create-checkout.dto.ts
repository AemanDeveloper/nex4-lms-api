import { IsIn } from 'class-validator';

export class CreateCheckoutDto {
  @IsIn(['STARTER', 'GROWTH'])
  plan!: 'STARTER' | 'GROWTH';

  @IsIn(['MYR'])
  currency!: 'MYR';

  @IsIn(['MONTHLY'])
  interval!: 'MONTHLY';
}

