import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import prisma from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", requireRole("SUPER_ADMIN"), async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      include: { branch: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(users.map((u) => ({ ...u, password: undefined })));
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.post("/", requireRole("SUPER_ADMIN"), async (req: Request, res: Response) => {
  try {
    const { name, email, password, role, branchId } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ error: "الاسم والبريد الإلكتروني وكلمة المرور مطلوبة" });
      return;
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(400).json({ error: "البريد الإلكتروني مستخدم مسبقاً" });
      return;
    }
    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, password: hashed, role: role || "BRANCH_ADMIN", branchId },
      include: { branch: true },
    });
    res.status(201).json({ ...user, password: undefined });
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.put("/:id", requireRole("SUPER_ADMIN"), async (req: Request, res: Response) => {
  try {
    const { name, email, password, role, branchId } = req.body;
    const data: Record<string, unknown> = { name, email, role, branchId };
    if (password) {
      data.password = await bcrypt.hash(password, 12);
    }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      include: { branch: true },
    });
    res.json({ ...user, password: undefined });
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.delete("/:id", requireRole("SUPER_ADMIN"), async (req: Request, res: Response) => {
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ message: "تم حذف المستخدم" });
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
