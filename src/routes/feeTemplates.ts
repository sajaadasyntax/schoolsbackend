import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// GET /api/fee-templates?academicYear=&branchId=
router.get("/", async (req: Request, res: Response) => {
  try {
    const { academicYear, branchId: queryBranch } = req.query;
    const { role, branchId: userBranch } = req.user!;

    const targetBranch = role === "SUPER_ADMIN" ? (queryBranch as string | undefined) : userBranch;

    const where: Record<string, unknown> = {};
    if (academicYear) where.academicYear = academicYear;
    if (targetBranch) where.class = { branchId: targetBranch };

    const templates = await prisma.classFeeTemplate.findMany({
      where,
      include: { class: { include: { branch: true } } },
      orderBy: { createdAt: "asc" },
    });
    res.json(templates);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// GET /api/fee-templates/:classId?academicYear=
router.get("/:classId", async (req: Request, res: Response) => {
  try {
    const { academicYear } = req.query;
    const template = await prisma.classFeeTemplate.findFirst({
      where: {
        classId: req.params.classId,
        academicYear: (academicYear as string) || undefined,
      },
      include: { class: true },
    });
    if (!template) {
      res.status(404).json({ error: "قالب الرسوم غير موجود" });
      return;
    }
    res.json(template);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// PUT /api/fee-templates/:classId — upsert
router.put("/:classId", async (req: Request, res: Response) => {
  try {
    const { academicYear, registration, installment1, installment2, installment3, installment4, books, uniform } =
      req.body;
    if (!academicYear) {
      res.status(400).json({ error: "السنة الدراسية مطلوبة" });
      return;
    }

    const template = await prisma.classFeeTemplate.upsert({
      where: {
        classId_academicYear: { classId: req.params.classId, academicYear },
      },
      create: {
        classId: req.params.classId,
        academicYear,
        registration: registration || 0,
        installment1: installment1 || 0,
        installment2: installment2 || 0,
        installment3: installment3 || 0,
        installment4: installment4 || 0,
        books: books || 0,
        uniform: uniform || 0,
      },
      update: {
        registration: registration || 0,
        installment1: installment1 || 0,
        installment2: installment2 || 0,
        installment3: installment3 || 0,
        installment4: installment4 || 0,
        books: books || 0,
        uniform: uniform || 0,
      },
      include: { class: { include: { branch: true } } },
    });
    res.json(template);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// POST /api/fee-templates/:classId/apply — generate Fee rows per student
router.post("/:classId/apply", async (req: Request, res: Response) => {
  try {
    const { academicYear } = req.body;
    if (!academicYear) {
      res.status(400).json({ error: "السنة الدراسية مطلوبة" });
      return;
    }

    const template = await prisma.classFeeTemplate.findUnique({
      where: { classId_academicYear: { classId: req.params.classId, academicYear } },
    });
    if (!template) {
      res.status(404).json({ error: "قالب الرسوم غير موجود لهذا الفصل" });
      return;
    }

    const students = await prisma.student.findMany({
      where: { classId: req.params.classId, status: "ACTIVE" },
    });

    const bucketMap = [
      { bucket: "REGISTRATION" as const, amount: template.registration, description: "التسجيل" },
      { bucket: "INSTALLMENT_1" as const, amount: template.installment1, description: "القسط الأول" },
      { bucket: "INSTALLMENT_2" as const, amount: template.installment2, description: "القسط الثاني" },
      { bucket: "INSTALLMENT_3" as const, amount: template.installment3, description: "القسط الثالث" },
      { bucket: "INSTALLMENT_4" as const, amount: template.installment4, description: "القسط الرابع" },
      { bucket: "BOOKS" as const, amount: template.books, description: "كتب" },
      { bucket: "UNIFORM" as const, amount: template.uniform, description: "زي" },
    ];

    let created = 0;
    let skipped = 0;

    for (const student of students) {
      for (const { bucket, amount, description } of bucketMap) {
        if (Number(amount) === 0) continue;

        const existing = await prisma.fee.findFirst({
          where: { studentId: student.id, academicYear, bucket },
        });

        if (existing) {
          skipped++;
          continue;
        }

        await prisma.fee.create({
          data: {
            studentId: student.id,
            academicYear,
            bucket,
            type: "TUITION",
            amount,
            description,
            templateId: template.id,
          },
        });
        created++;
      }
    }

    res.json({ created, skipped, students: students.length });
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
