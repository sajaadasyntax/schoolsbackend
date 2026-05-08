import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", async (req: Request, res: Response) => {
  try {
    const { role, branchId } = req.user!;
    const { search, status, classId, branchId: queryBranch } = req.query;

    const where: Record<string, unknown> = {};
    if (role !== "SUPER_ADMIN" && branchId) where.branchId = branchId;
    if (queryBranch && role === "SUPER_ADMIN") where.branchId = queryBranch;
    if (status) where.status = status;
    if (classId) where.classId = classId;
    if (search) {
      where.OR = [
        { fullName: { contains: search as string, mode: "insensitive" } },
        { parentName: { contains: search as string, mode: "insensitive" } },
        { parentPhone: { contains: search as string, mode: "insensitive" } },
      ];
    }

    const students = await prisma.student.findMany({
      where,
      include: {
        branch: true,
        class: true,
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(students);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const { role, branchId: userBranch } = req.user!;
    const { fullName, parentName, parentPhone, dateOfBirth, gender, classId, branchId, status, notes } = req.body;

    if (!fullName) {
      res.status(400).json({ error: "اسم الطالب مطلوب" });
      return;
    }

    const targetBranch = role === "SUPER_ADMIN" ? branchId : userBranch;
    if (!targetBranch) {
      res.status(400).json({ error: "الفرع مطلوب" });
      return;
    }

    const student = await prisma.student.create({
      data: {
        fullName,
        parentName,
        parentPhone,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
        gender,
        classId,
        branchId: targetBranch,
        status: status || "ACTIVE",
        notes,
      },
      include: { branch: true, class: true },
    });
    res.status(201).json(student);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const student = await prisma.student.findUnique({
      where: { id: req.params.id },
      include: {
        branch: true,
        class: true,
        fees: true,
        payments: { include: { receipt: true }, orderBy: { paymentDate: "desc" } },
        installments: { orderBy: { dueDate: "asc" } },
        transportSubscription: true,
        distributions: {
          include: { item: { include: { category: true } }, distributedBy: true },
          orderBy: { distributionDate: "desc" },
        },
      },
    });
    if (!student) {
      res.status(404).json({ error: "الطالب غير موجود" });
      return;
    }
    res.json(student);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { fullName, parentName, parentPhone, dateOfBirth, gender, classId, branchId, status, notes } = req.body;
    const student = await prisma.student.update({
      where: { id: req.params.id },
      data: {
        fullName,
        parentName,
        parentPhone,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
        gender,
        classId,
        branchId,
        status,
        notes,
      },
      include: { branch: true, class: true },
    });
    res.json(student);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    await prisma.student.delete({ where: { id: req.params.id } });
    res.json({ message: "تم حذف الطالب" });
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.get("/:id/financial-summary", async (req: Request, res: Response) => {
  try {
    const studentId = req.params.id;
    const fees = await prisma.fee.findMany({ where: { studentId } });
    const payments = await prisma.payment.findMany({ where: { studentId } });
    const installments = await prisma.installment.findMany({ where: { studentId } });

    const totalFees = fees.reduce((s, f) => s + Number(f.amount), 0);
    const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
    const totalInstallments = installments.reduce((s, i) => s + Number(i.amount), 0);
    const paidInstallments = installments.reduce((s, i) => s + Number(i.paidAmount), 0);
    const pendingInstallments = installments.filter((i) => i.status !== "PAID").reduce((s, i) => s + (Number(i.amount) - Number(i.paidAmount)), 0);

    res.json({
      totalFees,
      totalPaid,
      remaining: totalFees - totalPaid,
      totalInstallments,
      paidInstallments,
      pendingInstallments,
    });
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
