import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TRIAL_QUOTAS } from '../trial/trial.constants';
import { CreateUploadIntentDto } from './dto/create-upload-intent.dto';

const allowedContentTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/csv',
  'text/plain',
]);

@Injectable()
export class StorageService {
  private client: S3Client | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async createUploadIntent(organisationId: string, userId: string, input: CreateUploadIntentDto) {
    if (!allowedContentTypes.has(input.contentType.toLowerCase())) {
      throw new BadRequestException({ code: 'FILE_TYPE_NOT_ALLOWED', message: 'This file type is not supported.' });
    }

    const organisation = await this.prisma.organisation.findUnique({
      where: { id: organisationId },
      select: { storageUsedBytes: true },
    });
    if (!organisation) throw new NotFoundException();
    if (organisation.storageUsedBytes + BigInt(input.sizeBytes) > BigInt(TRIAL_QUOTAS.privateStorageBytes)) {
      throw new PayloadTooLargeException({ code: 'STORAGE_QUOTA_EXCEEDED', message: 'The organisation storage quota would be exceeded.' });
    }

    const fileId = randomUUID();
    const objectKey = `organisations/${organisationId}/${fileId}`;
    const file = await this.prisma.forOrganisation(organisationId, (transaction) =>
      transaction.storedFile.create({
        data: {
          id: fileId,
          organisationId,
          uploadedByUserId: userId,
          objectKey,
          fileName: input.fileName.trim(),
          contentType: input.contentType.toLowerCase(),
          sizeBytes: BigInt(input.sizeBytes),
        },
      }),
    );

    const uploadUrl = await getSignedUrl(
      this.getClient(),
      new PutObjectCommand({
        Bucket: this.bucket(),
        Key: objectKey,
        ContentType: file.contentType,
      }),
      { expiresIn: 600 },
    );

    return {
      fileId: file.id,
      uploadUrl,
      expiresInSeconds: 600,
      requiredHeaders: { 'content-type': file.contentType },
    };
  }

  async completeUpload(organisationId: string, userId: string, fileId: string) {
    const pending = await this.prisma.forOrganisation(organisationId, (transaction) =>
      transaction.storedFile.findFirst({ where: { id: fileId, organisationId, uploadedByUserId: userId } }),
    );
    if (!pending) throw new NotFoundException();
    if (pending.status === 'READY') return this.serialize(pending);

    const object = await this.getClient().send(new HeadObjectCommand({ Bucket: this.bucket(), Key: pending.objectKey }));
    if (object.ContentLength !== Number(pending.sizeBytes)) {
      throw new BadRequestException({ code: 'FILE_SIZE_MISMATCH', message: 'The uploaded file size does not match the request.' });
    }

    const completed = await this.prisma.forOrganisation(organisationId, async (transaction) => {
      const rows = await transaction.$queryRaw<Array<{ storageUsedBytes: bigint }>>`
        SELECT "storageUsedBytes" FROM public.organisations WHERE id = ${organisationId}::uuid FOR UPDATE
      `;
      const usedBytes = rows[0]?.storageUsedBytes;
      if (usedBytes === undefined) throw new NotFoundException();
      if (usedBytes + pending.sizeBytes > BigInt(TRIAL_QUOTAS.privateStorageBytes)) {
        throw new PayloadTooLargeException({ code: 'STORAGE_QUOTA_EXCEEDED', message: 'The organisation storage quota would be exceeded.' });
      }

      const claimed = await transaction.storedFile.updateMany({
        where: { id: fileId, organisationId, uploadedByUserId: userId, status: 'PENDING' },
        data: { status: 'READY', etag: object.ETag?.replaceAll('"', '') },
      });
      if (claimed.count === 1) {
        await transaction.organisation.update({
          where: { id: organisationId },
          data: { storageUsedBytes: { increment: pending.sizeBytes } },
        });
        await transaction.auditLog.create({
          data: {
            organisationId,
            actorUserId: userId,
            action: 'file.uploaded',
            targetType: 'stored_file',
            targetId: fileId,
            metadata: { sizeBytes: pending.sizeBytes.toString(), contentType: pending.contentType },
          },
        });
      }
      return transaction.storedFile.findUniqueOrThrow({ where: { id: fileId } });
    });
    return this.serialize(completed);
  }

  async list(organisationId: string, userId: string, role: MembershipRole) {
    const files = await this.prisma.forOrganisation(organisationId, (transaction) =>
      transaction.storedFile.findMany({
        where: { organisationId, status: 'READY', ...(role === MembershipRole.ORGANISATION_ADMIN ? {} : { uploadedByUserId: userId }) },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
    return files.map((file) => this.serialize(file));
  }

  async createDownload(organisationId: string, userId: string, role: MembershipRole, fileId: string) {
    const file = await this.prisma.forOrganisation(organisationId, async (transaction) => {
      const found = await transaction.storedFile.findFirst({ where: { id: fileId, organisationId, status: 'READY' } });
      if (!found) return null;
      if (role === MembershipRole.ORGANISATION_ADMIN || found.uploadedByUserId === userId) return found;
      if (role !== MembershipRole.TEACHER) return null;
      const teacher = await transaction.membership.findUnique({ where: { organisationId_userId_role: { organisationId, userId, role: MembershipRole.TEACHER } } });
      if (!teacher) return null;
      const [submissionAccess, quizAccess] = await Promise.all([
        transaction.submissionAttachment.findFirst({ where: { storedFileId: fileId, submission: { assignment: { course: { classes: { some: { class: { teachers: { some: { teacherMembershipId: teacher.id } } } } } } } } } }),
        transaction.quizAnswer.findFirst({ where: { storedFileId: fileId, attempt: { quiz: { course: { classes: { some: { class: { teachers: { some: { teacherMembershipId: teacher.id } } } } } } } } } }),
      ]);
      return submissionAccess || quizAccess ? found : null;
    });
    if (!file) throw new NotFoundException();
    const downloadUrl = await getSignedUrl(
      this.getClient(),
      new GetObjectCommand({
        Bucket: this.bucket(),
        Key: file.objectKey,
        ResponseContentType: file.contentType,
        ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      }),
      { expiresIn: 300 },
    );
    return { downloadUrl, expiresInSeconds: 300 };
  }

  async createImagePreview(organisationId: string, userId: string, role: MembershipRole, fileId: string) {
    const file = await this.prisma.forOrganisation(organisationId, (transaction) =>
      transaction.storedFile.findFirst({
        where: {
          id: fileId,
          organisationId,
          status: 'READY',
          contentType: { startsWith: 'image/' },
          ...(role === MembershipRole.ORGANISATION_ADMIN ? {} : { uploadedByUserId: userId }),
        },
      }),
    );
    if (!file) throw new NotFoundException();
    const previewUrl = await getSignedUrl(
      this.getClient(),
      new GetObjectCommand({
        Bucket: this.bucket(),
        Key: file.objectKey,
        ResponseContentType: file.contentType,
        ResponseContentDisposition: 'inline',
      }),
      { expiresIn: 300 },
    );
    return { previewUrl, expiresInSeconds: 300 };
  }

  async remove(organisationId: string, userId: string, role: MembershipRole, fileId: string) {
    const file = await this.prisma.forOrganisation(organisationId, (transaction) =>
      transaction.storedFile.findFirst({ where: { id: fileId, organisationId, status: 'READY' } }),
    );
    if (!file) throw new NotFoundException();
    if (role !== MembershipRole.ORGANISATION_ADMIN && file.uploadedByUserId !== userId) {
      throw new ForbiddenException({ code: 'FILE_ACCESS_DENIED', message: 'You cannot remove this file.' });
    }
    const linked = await this.prisma.forOrganisation(organisationId, async (transaction) => {
      const [submission, quiz] = await Promise.all([
        transaction.submissionAttachment.findUnique({ where: { storedFileId: fileId }, select: { id: true } }),
        transaction.quizAnswer.findFirst({ where: { storedFileId: fileId }, select: { id: true } }),
      ]);
      return Boolean(submission || quiz);
    });
    if (linked) throw new ConflictException({ code: 'FILE_IN_USE', message: 'This file is attached to coursework and cannot be removed.' });

    await this.getClient().send(new DeleteObjectCommand({ Bucket: this.bucket(), Key: file.objectKey }));
    await this.prisma.forOrganisation(organisationId, async (transaction) => {
      await transaction.storedFile.delete({ where: { id: fileId } });
      await transaction.organisation.update({
        where: { id: organisationId },
        data: { storageUsedBytes: { decrement: file.sizeBytes } },
      });
      await transaction.auditLog.create({
        data: { organisationId, actorUserId: userId, action: 'file.deleted', targetType: 'stored_file', targetId: fileId, metadata: {} },
      });
    });
    return { deleted: true };
  }

  private serialize(file: { id: string; fileName: string; contentType: string; sizeBytes: bigint; status: string; createdAt: Date }) {
    return { ...file, sizeBytes: file.sizeBytes.toString() };
  }

  private bucket() {
    return this.config.getOrThrow<string>('S3_BUCKET');
  }

  private getClient() {
    if (this.client) return this.client;
    const endpoint = this.config.get<string>('S3_ENDPOINT');
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('S3_SECRET_ACCESS_KEY');
    if (!endpoint || !accessKeyId || !secretAccessKey || !this.config.get<string>('S3_BUCKET')) {
      throw new ServiceUnavailableException({ code: 'STORAGE_NOT_CONFIGURED', message: 'Private file storage is not configured.' });
    }
    this.client = new S3Client({
      endpoint,
      region: this.config.get<string>('S3_REGION', 'ap-southeast-1'),
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    });
    return this.client;
  }
}
