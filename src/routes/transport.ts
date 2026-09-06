import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", async (req: Request, res: Response) => {
  try {
    const { role, branchId } = req.user!;
    const { status } = req.query;
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (role !== "SUPER_ADMIN" && branchId) {
      where.student = { branchId };
    }
    const subscriptions = await prisma.transportSubscription.findMany({
      where,
      include: {
        student: { select: { fullName: true, branch: true, class: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(subscriptions);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const { studentId, route, monthlyFee, startDate, endDate, notes } = req.body;
    if (!studentId || !monthlyFee) {
      res.status(400).json({ error: "الطالب والرسوم الشهرية مطلوبان" });
      return;
    }

    const existing = await prisma.transportSubscription.findUnique({ where: { studentId } });
    if (existing) {
      res.status(400).json({ error: "الطالب مشترك بالفعل في خدمة النقل" });
      return;
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { class: { select: { academicYear: true } }, fullName: true },
    });
    if (!student) {
      res.status(404).json({ error: "الطالب غير موجود" });
      return;
    }

    const subscription = await prisma.$transaction(async (tx) => {
      const created = await tx.transportSubscription.create({
        data: {
          studentId,
          route,
          monthlyFee,
          startDate: startDate ? new Date(startDate) : new Date(),
          endDate: endDate ? new Date(endDate) : undefined,
          notes,
        },
        include: {
          student: { select: { fullName: true, branch: true, class: true } },
        },
      });

      await tx.fee.create({
        data: {
          studentId,
          type: "TRANSPORT",
          bucket: "TRANSPORT",
          amount: monthlyFee,
          description: "رسوم النقل المدرسي",
          academicYear: student.class?.academicYear || "2024-2025",
        },
      });

      return created;
    });
    res.status(201).json(subscription);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { route, monthlyFee, startDate, endDate, status, notes } = req.body;
    const subscription = await prisma.$transaction(async (tx) => {
      const updated = await tx.transportSubscription.update({
        where: { id: req.params.id },
        data: {
          route,
          monthlyFee,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
          status,
          notes,
        },
        include: {
          student: { select: { fullName: true, branch: true, class: true } },
        },
      });

      if (monthlyFee !== undefined) {
        await tx.fee.updateMany({
          where: { studentId: updated.studentId, bucket: "TRANSPORT", paidAmount: 0 },
          data: { amount: monthlyFee },
        });
      }

      return updated;
    });
    res.json(subscription);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    await prisma.transportSubscription.delete({ where: { id: req.params.id } });
    res.json({ message: "تم حذف الاشتراك" });
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
