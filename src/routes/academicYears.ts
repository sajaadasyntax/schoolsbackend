import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// List all academic years
router.get("/", async (_req: Request, res: Response) => {
  try {
    const years = await prisma.academicYear.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(years);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// Create a new academic year; optionally copy fee templates from the current OPEN year
router.post("/", async (req: Request, res: Response) => {
  try {
    const { name, copyFromYear } = req.body;
    if (!name) {
      res.status(400).json({ error: "اسم السنة الدراسية مطلوب" });
      return;
    }

    const year = await prisma.academicYear.create({ data: { name } });

    if (copyFromYear) {
      // Copy all ClassFeeTemplate rows from copyFromYear into name
      const templates = await prisma.classFeeTemplate.findMany({
        where: { academicYear: copyFromYear },
      });

      for (const t of templates) {
        await prisma.classFeeTemplate.upsert({
          where: { classId_academicYear: { classId: t.classId, academicYear: name } },
          update: {
            registration: t.registration,
            installment1: t.installment1,
            installment2: t.installment2,
            installment3: t.installment3,
            installment4: t.installment4,
            books: t.books,
            uniform: t.uniform,
          },
          create: {
            classId: t.classId,
            academicYear: name,
            registration: t.registration,
            installment1: t.installment1,
            installment2: t.installment2,
            installment3: t.installment3,
            installment4: t.installment4,
            books: t.books,
            uniform: t.uniform,
          },
        });
      }
    }

    res.status(201).json(year);
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      res.status(409).json({ error: "هذه السنة الدراسية موجودة مسبقاً" });
      return;
    }
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// Close a year
router.post("/:id/close", async (req: Request, res: Response) => {
  try {
    const year = await prisma.academicYear.update({
      where: { id: req.params.id },
      data: { status: "CLOSED", closedAt: new Date() },
    });
    res.json(year);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// Reopen a year (admin safety valve)
router.post("/:id/reopen", async (req: Request, res: Response) => {
  try {
    const year = await prisma.academicYear.update({
      where: { id: req.params.id },
      data: { status: "OPEN", closedAt: null },
    });
    res.json(year);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
