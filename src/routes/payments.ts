import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { upload } from "../lib/upload";
import path from "path";

const router = Router();
router.use(requireAuth);

router.get("/fees", async (req: Request, res: Response) => {
  try {
    const { role, branchId } = req.user!;
    const { studentId } = req.query;
    const where: Record<string, unknown> = {};
    if (studentId) where.studentId = studentId;
    if (role !== "SUPER_ADMIN" && branchId) {
      where.student = { branchId };
    }
    const fees = await prisma.fee.findMany({
      where,
      include: {
        student: { select: { fullName: true, branch: true } },
        payments: { select: { id: true, amount: true, paymentDate: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(fees);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.post("/fees", async (req: Request, res: Response) => {
  try {
    const { studentId, bucket, type, amount, description, academicYear } = req.body;
    if (!studentId || !amount) {
      res.status(400).json({ error: "الطالب والمبلغ مطلوبان" });
      return;
    }
    const resolvedBucket = bucket || type || "OTHER";
    if (resolvedBucket === "TRANSPORT") {
      res.status(400).json({ error: "رسوم النقل تُدار عبر صفحة النقل المدرسي فقط" });
      return;
    }
    const fee = await prisma.fee.create({
      data: { studentId, bucket: resolvedBucket, amount, description, academicYear },
    });
    res.status(201).json(fee);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.delete("/fees/:id", async (req: Request, res: Response) => {
  try {
    await prisma.fee.delete({ where: { id: req.params.id } });
    res.json({ message: "تم حذف الرسم" });
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const { role, branchId } = req.user!;
    const { studentId, method } = req.query;
    const where: Record<string, unknown> = {};
    if (studentId) where.studentId = studentId;
    if (method) where.method = method;
    if (role !== "SUPER_ADMIN" && branchId) {
      where.student = { branchId };
    }
    const payments = await prisma.payment.findMany({
      where,
      include: {
        student: { select: { fullName: true, branch: true } },
        receipt: true,
        fee: true,
      },
      orderBy: { paymentDate: "desc" },
    });
    res.json(payments);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.post("/", upload.single("receipt"), async (req: Request, res: Response) => {
  try {
    const { studentId, amount, paymentDate, method, receiptNumber, notes, feeId } = req.body;
    if (!studentId || !amount) {
      res.status(400).json({ error: "الطالب والمبلغ مطلوبان" });
      return;
    }

    if (receiptNumber) {
      const existing = await prisma.payment.findUnique({ where: { receiptNumber } });
      if (existing) {
        res.status(400).json({ error: "رقم الإيصال مستخدم مسبقاً" });
        return;
      }
    }

    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          studentId,
          amount,
          paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
          method: method || "CASH",
          receiptNumber: receiptNumber || undefined,
          notes,
          feeId: feeId || undefined,
        },
        include: { student: { select: { fullName: true } }, receipt: true },
      });

      if (feeId) {
        const fee = await tx.fee.findUnique({ where: { id: feeId } });
        if (fee) {
          const newPaid = Number(fee.paidAmount) + Number(amount);
          await tx.fee.update({
            where: { id: feeId },
            data: { paidAmount: newPaid },
          });
        }
      }

      return created;
    });

    if (req.file) {
      const imagePath = `/uploads/${req.file.filename}`;
      await prisma.receipt.create({
        data: {
          paymentId: payment.id,
          imagePath,
          originalName: req.file.originalname,
        },
      });
    }

    const updatedPayment = await prisma.payment.findUnique({
      where: { id: payment.id },
      include: { student: { select: { fullName: true } }, receipt: true, fee: true },
    });

    res.status(201).json(updatedPayment);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: req.params.id } });
      if (!payment) return;

      if (payment.feeId) {
        const fee = await tx.fee.findUnique({ where: { id: payment.feeId } });
        if (fee) {
          const newPaid = Math.max(0, Number(fee.paidAmount) - Number(payment.amount));
          await tx.fee.update({ where: { id: payment.feeId }, data: { paidAmount: newPaid } });
        }
      }

      await tx.payment.delete({ where: { id: req.params.id } });
    });
    res.json({ message: "تم حذف الدفعة" });
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.get("/receipts/recent", async (req: Request, res: Response) => {
  try {
    const { role, branchId } = req.user!;
    const { limit: limitQuery } = req.query;
    const take = Math.min(parseInt(limitQuery as string) || 50, 200);

    const where: Record<string, unknown> = { receipt: { isNot: null } };
    if (role !== "SUPER_ADMIN" && branchId) {
      where.student = { branchId };
    }

    const rows = await prisma.payment.findMany({
      where,
      include: {
        receipt: true,
        student: { select: { fullName: true, branch: true } },
        fee: true,
      },
      orderBy: { paymentDate: "desc" },
      take,
    });

    res.json(rows);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.get("/verify/:receiptNumber", async (req: Request, res: Response) => {
  try {
    const payment = await prisma.payment.findUnique({
      where: { receiptNumber: req.params.receiptNumber },
      include: {
        student: { select: { fullName: true, branch: true } },
        receipt: true,
      },
    });
    if (!payment) {
      res.status(404).json({ error: "لم يتم العثور على إيصال بهذا الرقم" });
      return;
    }
    res.json(payment);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.get("/installments", async (req: Request, res: Response) => {
  try {
    const { role, branchId } = req.user!;
    const { studentId, status } = req.query;
    const where: Record<string, unknown> = {};
    if (studentId) where.studentId = studentId;
    if (status) where.status = status;
    if (role !== "SUPER_ADMIN" && branchId) {
      where.student = { branchId };
    }
    const installments = await prisma.installment.findMany({
      where,
      include: { student: { select: { fullName: true, branch: true } } },
      orderBy: { dueDate: "asc" },
    });
    res.json(installments);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.post("/installments/bulk", async (req: Request, res: Response) => {
  try {
    const { studentId, installments } = req.body;
    if (!studentId || !Array.isArray(installments) || installments.length === 0) {
      res.status(400).json({ error: "بيانات الأقساط غير صحيحة" });
      return;
    }
    const created = await prisma.installment.createMany({
      data: installments.map((inst: { amount: number; dueDate: string; notes?: string }) => ({
        studentId,
        amount: inst.amount,
        dueDate: new Date(inst.dueDate),
        notes: inst.notes,
      })),
    });
    res.status(201).json({ count: created.count });
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.put("/installments/:id", async (req: Request, res: Response) => {
  try {
    const { paidAmount } = req.body;
    const installment = await prisma.installment.findUnique({ where: { id: req.params.id } });
    if (!installment) {
      res.status(404).json({ error: "القسط غير موجود" });
      return;
    }
    const newPaid = Number(paidAmount);
    const total = Number(installment.amount);
    let status: string = installment.status;
    if (newPaid >= total) status = "PAID";
    else if (newPaid > 0) status = "PARTIAL";
    const updated = await prisma.installment.update({
      where: { id: req.params.id },
      data: { paidAmount: newPaid, status: status as never },
    });
    res.json(updated);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.post("/installments/mark-overdue", async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const result = await prisma.installment.updateMany({
      where: {
        dueDate: { lt: now },
        status: { in: ["PENDING", "PARTIAL"] },
      },
      data: { status: "OVERDUE" },
    });
    res.json({ updated: result.count });
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
