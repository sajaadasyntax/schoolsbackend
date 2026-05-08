import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", async (req: Request, res: Response) => {
  try {
    const { role, branchId } = req.user!;
    const where = role === "SUPER_ADMIN" ? {} : { id: branchId };
    const branches = await prisma.branch.findMany({
      where,
      include: {
        _count: { select: { students: true, classes: true, employees: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    res.json(branches);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.post("/", requireRole("SUPER_ADMIN"), async (req: Request, res: Response) => {
  try {
    const { name, type, address, phone } = req.body;
    if (!name) {
      res.status(400).json({ error: "اسم الفرع مطلوب" });
      return;
    }
    const branch = await prisma.branch.create({ data: { name, type, address, phone } });
    res.status(201).json(branch);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const branch = await prisma.branch.findUnique({
      where: { id: req.params.id },
      include: {
        classes: { include: { teacher: true, _count: { select: { students: true } } } },
        employees: true,
        _count: { select: { students: true, classes: true, employees: true } },
      },
    });
    if (!branch) {
      res.status(404).json({ error: "الفرع غير موجود" });
      return;
    }
    res.json(branch);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.put("/:id", requireRole("SUPER_ADMIN"), async (req: Request, res: Response) => {
  try {
    const { name, type, address, phone } = req.body;
    const branch = await prisma.branch.update({
      where: { id: req.params.id },
      data: { name, type, address, phone },
    });
    res.json(branch);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.delete("/:id", requireRole("SUPER_ADMIN"), async (req: Request, res: Response) => {
  try {
    await prisma.branch.delete({ where: { id: req.params.id } });
    res.json({ message: "تم حذف الفرع" });
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.post("/:id/classes", requireRole("SUPER_ADMIN", "BRANCH_ADMIN"), async (req: Request, res: Response) => {
  try {
    const { name, grade, teacherId, academicYear } = req.body;
    if (!name) {
      res.status(400).json({ error: "اسم الفصل مطلوب" });
      return;
    }
    const cls = await prisma.class.create({
      data: { name, grade, teacherId, academicYear, branchId: req.params.id },
      include: { teacher: true },
    });
    res.status(201).json(cls);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.put("/classes/:classId", requireRole("SUPER_ADMIN", "BRANCH_ADMIN"), async (req: Request, res: Response) => {
  try {
    const { name, grade, teacherId, academicYear } = req.body;
    const cls = await prisma.class.update({
      where: { id: req.params.classId },
      data: { name, grade, teacherId, academicYear },
      include: { teacher: true },
    });
    res.json(cls);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.delete("/classes/:classId", requireRole("SUPER_ADMIN", "BRANCH_ADMIN"), async (req: Request, res: Response) => {
  try {
    await prisma.class.delete({ where: { id: req.params.classId } });
    res.json({ message: "تم حذف الفصل" });
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
