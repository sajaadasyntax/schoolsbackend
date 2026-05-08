import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { upload } from "../lib/upload";

const router = Router();
router.use(requireAuth);

router.get("/categories", async (req: Request, res: Response) => {
  try {
    const { role, branchId } = req.user!;
    const where: Record<string, unknown> = {};
    if (role !== "SUPER_ADMIN" && branchId) where.branchId = branchId;
    const categories = await prisma.inventoryCategory.findMany({
      where,
      include: { branch: true, _count: { select: { items: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(categories);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.post("/categories", async (req: Request, res: Response) => {
  try {
    const { role, branchId: userBranch } = req.user!;
    const { name, type, description, branchId } = req.body;
    const targetBranch = role === "SUPER_ADMIN" ? branchId : userBranch;
    if (!targetBranch || !name) {
      res.status(400).json({ error: "الفرع والاسم مطلوبان" });
      return;
    }
    const category = await prisma.inventoryCategory.create({
      data: { name, type: type || "CUSTOM", description, branchId: targetBranch },
      include: { branch: true },
    });
    res.status(201).json(category);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.delete("/categories/:id", async (req: Request, res: Response) => {
  try {
    await prisma.inventoryCategory.delete({ where: { id: req.params.id } });
    res.json({ message: "تم حذف الفئة" });
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.get("/items", async (req: Request, res: Response) => {
  try {
    const { role, branchId } = req.user!;
    const { categoryId } = req.query;
    const where: Record<string, unknown> = {};
    if (role !== "SUPER_ADMIN" && branchId) where.branchId = branchId;
    if (categoryId) where.categoryId = categoryId;
    const items = await prisma.inventoryItem.findMany({
      where,
      include: { category: true, branch: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(items);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.get("/items/low-stock", async (req: Request, res: Response) => {
  try {
    const { role, branchId } = req.user!;
    const where: Record<string, unknown> = {};
    if (role !== "SUPER_ADMIN" && branchId) where.branchId = branchId;
    const items = await prisma.inventoryItem.findMany({
      where,
      include: { category: true, branch: true },
    });
    const lowStock = items.filter((i) => i.quantity <= i.minQuantity);
    res.json(lowStock);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.post("/items", upload.single("invoice"), async (req: Request, res: Response) => {
  try {
    const { role, branchId: userBranch } = req.user!;
    const { name, categoryId, branchId, quantity, minQuantity, unitPrice, description } = req.body;
    const targetBranch = role === "SUPER_ADMIN" ? branchId : userBranch;
    if (!targetBranch || !name || !categoryId) {
      res.status(400).json({ error: "الفرع والاسم والفئة مطلوبة" });
      return;
    }

    const qty = parseInt(quantity) || 0;
    const price = parseFloat(unitPrice) || 0;
    const totalCost = price * qty;

    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.create({
        data: {
          name,
          categoryId,
          branchId: targetBranch,
          quantity: qty,
          minQuantity: parseInt(minQuantity) || 0,
          unitPrice: price || undefined,
          description,
        },
        include: { category: true, branch: true },
      });

      if (totalCost > 0) {
        const invoicePath = req.file ? `/uploads/${req.file.filename}` : null;
        await tx.expense.create({
          data: {
            branchId: targetBranch,
            category: "مشتريات مستودع",
            description: `${item.name} (${qty} وحدة)`,
            amount: totalCost,
            invoicePath,
            invoiceOriginalName: req.file?.originalname ?? null,
            inventoryItemId: item.id,
          },
        });
      }

      return item;
    });

    res.status(201).json(result);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.put("/items/:id", async (req: Request, res: Response) => {
  try {
    const { name, categoryId, quantity, minQuantity, unitPrice, description } = req.body;
    const item = await prisma.inventoryItem.update({
      where: { id: req.params.id },
      data: { name, categoryId, quantity, minQuantity, unitPrice, description },
      include: { category: true, branch: true },
    });
    res.json(item);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.delete("/items/:id", async (req: Request, res: Response) => {
  try {
    await prisma.inventoryItem.delete({ where: { id: req.params.id } });
    res.json({ message: "تم حذف العنصر" });
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.get("/distributions", async (req: Request, res: Response) => {
  try {
    const { role, branchId } = req.user!;
    const { studentId, itemId } = req.query;
    const where: Record<string, unknown> = {};
    if (studentId) where.studentId = studentId;
    if (itemId) where.itemId = itemId;
    if (role !== "SUPER_ADMIN" && branchId) {
      where.item = { branchId };
    }
    const distributions = await prisma.inventoryDistribution.findMany({
      where,
      include: {
        item: { include: { category: true } },
        student: { select: { fullName: true, branch: true } },
        distributedBy: { select: { name: true } },
      },
      orderBy: { distributionDate: "desc" },
    });
    res.json(distributions);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.post("/distribute", async (req: Request, res: Response) => {
  try {
    const { itemId, studentId, quantity, notes } = req.body;
    if (!itemId || !studentId) {
      res.status(400).json({ error: "العنصر والطالب مطلوبان" });
      return;
    }
    const qty = parseInt(quantity) || 1;
    const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
    if (!item) {
      res.status(404).json({ error: "العنصر غير موجود" });
      return;
    }
    if (item.quantity < qty) {
      res.status(400).json({ error: "الكمية المتاحة غير كافية" });
      return;
    }

    const distribution = await prisma.inventoryDistribution.create({
      data: {
        itemId,
        studentId,
        quantity: qty,
        notes,
        distributedById: req.user!.userId,
      },
      include: {
        item: { include: { category: true } },
        student: { select: { fullName: true } },
        distributedBy: { select: { name: true } },
      },
    });

    await prisma.inventoryItem.update({
      where: { id: itemId },
      data: { quantity: { decrement: qty } },
    });

    res.status(201).json(distribution);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
