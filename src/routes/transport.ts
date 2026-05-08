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

    const subscription = await prisma.transportSubscription.create({
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
    res.status(201).json(subscription);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { route, monthlyFee, startDate, endDate, status, notes } = req.body;
    const subscription = await prisma.transportSubscription.update({
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
