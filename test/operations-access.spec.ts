import { BadRequestException, NotFoundException } from "@nestjs/common";
import { MembershipRole } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { OperationsService } from "../src/operations/operations.service";
import type { PrismaService } from "../src/prisma/prisma.service";

function tenantPrisma(transaction: object) {
  return {
    forOrganisation: vi.fn((_organisationId, operation) =>
      operation(transaction),
    ),
  } as unknown as PrismaService;
}

const teacher = {
  organisationId: "00000000-0000-0000-0000-000000000000",
  userId: "teacher-id",
  role: MembershipRole.TEACHER,
};

describe("attendance and timetable access", () => {
  it("keeps Teachers inside assigned classes", async () => {
    const transaction = {
      membership: {
        findUnique: vi.fn().mockResolvedValue({ id: "teacher-membership" }),
      },
      class: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new OperationsService(tenantPrisma(transaction));
    await expect(
      service.createTimetableEntry(teacher, {
        classId: "00000000-0000-0000-0000-000000000001",
        title: "Mathematics",
        startsAt: "2026-10-16T01:00:00.000Z",
        endsAt: "2026-10-16T02:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects attendance for Students outside the class", async () => {
    const transaction = {
      membership: {
        findUnique: vi.fn().mockResolvedValue({ id: "teacher-membership" }),
      },
      class: { findFirst: vi.fn().mockResolvedValue({ id: "class-id" }) },
      classStudent: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new OperationsService(tenantPrisma(transaction));
    await expect(
      service.saveAttendance(teacher, {
        classId: "00000000-0000-0000-0000-000000000001",
        attendanceDate: "2026-10-16",
        records: [
          {
            studentMembershipId: "00000000-0000-0000-0000-000000000002",
            status: "PRESENT",
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects timetable entries with reversed times", async () => {
    const transaction = {
      membership: {
        findUnique: vi.fn().mockResolvedValue({ id: "teacher-membership" }),
      },
      class: { findFirst: vi.fn().mockResolvedValue({ id: "class-id" }) },
    };
    const service = new OperationsService(tenantPrisma(transaction));
    await expect(
      service.createTimetableEntry(teacher, {
        classId: "00000000-0000-0000-0000-000000000001",
        title: "Mathematics",
        startsAt: "2026-10-16T02:00:00.000Z",
        endsAt: "2026-10-16T01:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
