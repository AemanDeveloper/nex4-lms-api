import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async forOrganisation<T>(organisationId: string, operation: (transaction: Prisma.TransactionClient) => Promise<T>) {
    return this.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT set_config('app.current_organisation_id', ${organisationId}, true)`;
      return operation(transaction);
    });
  }
}
