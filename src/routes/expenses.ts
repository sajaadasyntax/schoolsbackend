import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", async (req: Request, res: Response) => {
  try {
    const { role, branchId } = req.user!;
    const { category, branchId: queryBranch } = req.query;
    const where: Record<string, unknown> = {};
    if (role !== "SUPER_ADMIN" && branchId) where.branchId = branchId;
    if (queryBranch && role === "SUPER_ADMIN") where.branchId = queryBranch;
    if (category) where.category = category;
    const expenses = await prisma.expense.findMany({
      where,
      include: { branch: true },
      orderBy: { date: "desc" },
    });
    res.json(expenses);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const { role, branchId: userBranch } = req.user!;
    const { branchId, category, description, amount, date, notes } = req.body;
    const targetBranch = role === "SUPER_ADMIN" ? branchId : userBranch;
    if (!targetBranch || !category || !amount) {
      res.status(400).json({ error: "الفرع والفئة والمبلغ مطلوبة" });
      return;
    }
    const expense = await prisma.expense.create({
      data: {
        branchId: targetBranch,
        category,
        description,
        amount,
        date: date ? new Date(date) : new Date(),
        notes,
      },
      include: { branch: true },
    });
    res.status(201).json(expense);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { category, description, amount, date, notes } = req.body;
    const expense = await prisma.expense.update({
      where: { id: req.params.id },
      data: { category, description, amount, date: date ? new Date(date) : undefined, notes },
      include: { branch: true },
    });
    res.json(expense);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    await prisma.expense.delete({ where: { id: req.params.id } });
    res.json({ message: "تم حذف المصروف" });
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.get("/employees", async (req: Request, res: Response) => {
  try {
    const { role, branchId } = req.user!;
    const { status } = req.query;
    const where: Record<string, unknown> = {};
    if (role !== "SUPER_ADMIN" && branchId) where.branchId = branchId;
    if (status) where.status = status;
    const employees = await prisma.employee.findMany({
      where,
      include: { branch: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(employees);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.post("/employees", async (req: Request, res: Response) => {
  try {
    const { role, branchId: userBranch } = req.user!;
    const { branchId, fullName, jobTitle, phone, email, baseSalary, hireDate, status, notes } = req.body;
    const targetBranch = role === "SUPER_ADMIN" ? branchId : userBranch;
    if (!targetBranch || !fullName || !baseSalary) {
      res.status(400).json({ error: "الفرع والاسم والراتب مطلوبة" });
      return;
    }
    const employee = await prisma.employee.create({
      data: {
        branchId: targetBranch,
        fullName,
        jobTitle,
        phone,
        email,
        baseSalary,
        hireDate: hireDate ? new Date(hireDate) : new Date(),
        status: status || "ACTIVE",
        notes,
      },
      include: { branch: true },
    });
    res.status(201).json(employee);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.put("/employees/:id", async (req: Request, res: Response) => {
  try {
    const { fullName, jobTitle, phone, email, baseSalary, status, notes } = req.body;
    const employee = await prisma.employee.update({
      where: { id: req.params.id },
      data: { fullName, jobTitle, phone, email, baseSalary, status, notes },
      include: { branch: true },
    });
    res.json(employee);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.delete("/employees/:id", async (req: Request, res: Response) => {
  try {
    await prisma.employee.delete({ where: { id: req.params.id } });
    res.json({ message: "تم حذف الموظف" });
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.get("/salary-payments", async (req: Request, res: Response) => {
  try {
    const { role, branchId } = req.user!;
    const { employeeId, year, month } = req.query;
    const where: Record<string, unknown> = {};
    if (employeeId) where.employeeId = employeeId;
    if (year) where.year = parseInt(year as string);
    if (month) where.month = parseInt(month as string);
    if (role !== "SUPER_ADMIN" && branchId) {
      where.employee = { branchId };
    }
    const salaryPayments = await prisma.salaryPayment.findMany({
      where,
      include: { employee: { include: { branch: true } } },
      orderBy: { paidDate: "desc" },
    });
    res.json(salaryPayments);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.post("/salary-payments", async (req: Request, res: Response) => {
  try {
    const { employeeId, amount, month, year, paidDate, notes } = req.body;
    if (!employeeId || !amount || !month || !year) {
      res.status(400).json({ error: "الموظف والمبلغ والشهر والسنة مطلوبة" });
      return;
    }
    const salaryPayment = await prisma.salaryPayment.create({
      data: {
        employeeId,
        amount,
        month: parseInt(month),
        year: parseInt(year),
        paidDate: paidDate ? new Date(paidDate) : new Date(),
        notes,
      },
      include: { employee: { include: { branch: true } } },
    });
    res.status(201).json(salaryPayment);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
