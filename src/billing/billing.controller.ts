import { BadRequestException, Body, Controller, Headers, Post, Req, UseGuards } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { MemberAuthGuard } from '../auth/member-auth.guard';
import type { MemberRequest } from '../auth/auth.types';
import { MembershipRole } from '@prisma/client';
import { BillingService } from './billing.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

@ApiTags('subscriptions')
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @ApiBearerAuth()
  @UseGuards(MemberAuthGuard)
  @Post('checkout')
  checkout(@Req() request: MemberRequest, @Body() body: CreateCheckoutDto) {
    if (request.member.role !== MembershipRole.ORGANISATION_ADMIN) throw new BadRequestException({ code: 'ADMIN_REQUIRED', message: 'An organisation administrator must manage billing.' });
    return this.billing.createCheckout(request.member.organisationId, body);
  }

  @Post('webhooks/stripe')
  webhook(@Req() request: RawBodyRequest<Request>, @Headers('stripe-signature') signature?: string) {
    if (!request.rawBody || !signature) throw new BadRequestException({ code: 'INVALID_WEBHOOK', message: 'Missing Stripe signature.' });
    return this.billing.handleWebhook(request.rawBody, signature);
  }
}
